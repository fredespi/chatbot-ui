import {getServerSession} from "next-auth/next"
import authOptions from "./auth/[...nextauth]"
import {DEFAULT_TEMPERATURE, OPENAI_API_HOST, SAVE_CONTEXT_URLS} from '@/utils/app/const';
// import { cleanSourceText } from '@/utils/server/google';
import {OpenaiRetrievalBody, OpenaiRetrievalDocument, OpenaiRetrievalSource} from '@/types/retrieval';
import endent from 'endent';
import {OpenAIError, OpenAIStream} from '@/utils/server';
import {Message} from '@/types/chat';

// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import {Tiktoken, init} from '@dqbd/tiktoken/lite/init';
import jsdom, {JSDOM} from "jsdom";
import {Readability} from "@mozilla/readability";
import {cleanSourceText} from "@/utils/server/google";
import {UrlContextSource} from "@/types/urlContext";
import {NextApiRequest, NextApiResponse} from "next";

// export const config = {
//   runtime: 'edge',
// };

// const handler = async (req: Request): Promise<Response> => {
const handler = async (req: NextApiRequest, res: NextApiResponse<any>) => {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    res.send({
      error: "You must be signed in to view the protected content on this page.",
    })
  } else {
    // @ts-ignore
    const emailAddress = session.user.email
    console.log("user: ", emailAddress)
    try {
      const {messages, key, model, temperature} =
        (await req.body) as OpenaiRetrievalBody;
      const userMessage = messages[messages.length - 1];

      // If the SAVE_CONTEXT_URLS env var is set, we'll try to fetch the text of any URLs in the user's message
      // and upsert them into the retrieval plugin vector db.
      let filteredSources: UrlContextSource[] = [];
      if (SAVE_CONTEXT_URLS) {
        const urlPattern = new RegExp('(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%\(\)=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%\(\)=~_|$])', 'gi');
        const urls = userMessage.content.match(urlPattern) || []

        const urlContextSources: UrlContextSource[] = urls.map((item: any) => ({
          link: item,
          text: '',
          pdf: '',
        }));

        console.log('Found urls', JSON.stringify(urlContextSources))
        if (urlContextSources.length > 0) {
          const urlContextSourcesWithText: any = await Promise.all(
            urlContextSources.map(async (source) => {
              try {
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Request timed out')), 5000),
                );

                // let headers = new Headers({
                //   "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.50 Safari/537.36"
                // });
                const res = (await Promise.race([
                  // fetch(source.link, {
                  //     method  : 'GET',
                  //     headers : headers,
                  //     // ... etc
                  // }),
                  fetch(source.link),
                  timeoutPromise,
                ])) as Response;

                // Check if the response is a PDF
                if (res.headers.get('Content-Type') === 'application/pdf') {
                  const pdfBuffer = await res.blob();
                  return {
                    ...source,
                    pdf: pdfBuffer,
                  } as UrlContextSource;
                }

                const html = await res.text();

                const virtualConsole = new jsdom.VirtualConsole();
                virtualConsole.on('error', (error) => {
                  if (!error.message.includes('Could not parse CSS stylesheet')) {
                    console.error(error);
                  }
                });

                const dom = new JSDOM(html, {virtualConsole});
                const doc = dom.window.document;
                const parsed = new Readability(doc).parse();

                if (parsed) {
                  let sourceText = cleanSourceText(parsed.textContent);

                  return {
                    ...source,
                    // TODO: switch to tokens
                    text: sourceText,
                  } as UrlContextSource;
                }

                return null;
              } catch (error) {
                console.error(error);
                return null;
              }
            }),
          );

          filteredSources = urlContextSourcesWithText.filter(Boolean);

          console.log('Fetched urls as pages or pdfs', filteredSources)

          // Now upsert the sources into the vector db
          if (filteredSources.length > 0) {
            const upsertUrl = `${process.env.RETRIEVAL_PLUGIN_URL}/upsert`;
            const upsertFileUrl = `${process.env.RETRIEVAL_PLUGIN_URL}/upsert-file`;
            const upsertHeaders = {
              'Authorization': `Bearer ${process.env.RETRIEVAL_BEARER_KEY}`,
              'Content-Type': 'application/json'
            };
            const upsertFileHeaders = {
              'Authorization': `Bearer ${process.env.RETRIEVAL_BEARER_KEY}`,
              // 'Content-Type': 'application/pdf'
            };

            // Collect all the sources that are not PDFs and create documents from them
            const documents: (OpenaiRetrievalDocument | null)[] = filteredSources.map((source) => {
              if (!source.pdf) {
                return {
                  id: source.link,
                  text: source.text,
                  metadata: {
                    source: 'file',
                    source_id: source.link,
                    url: source.link,
                    created_at: new Date().toISOString(),
                    author: emailAddress,
                  }
                };
              } else {
                return null;
              }
            }).filter(Boolean);

            console.log("Preparing for upsert document urls: " + documents.length)

            // Collect all the sources that are PDFs
            const pdfs: UrlContextSource[] = filteredSources.filter((source) => source.pdf);
            console.log("Preparing for upsert PDF urls: " + pdfs.length)


            // Upsert-file the PDFs
            await Promise.all(
              pdfs.map(async (source) => {
                try {
                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), 60000),
                  );

                  const formData = new FormData();
                  formData.append('file', source.pdf)
                  formData.append('metadata', JSON.stringify({
                    source: 'file',
                    source_id: source.link,
                    url: source.link,
                    created_at: new Date().toISOString(),
                    author: emailAddress,
                  }))

                  const res = (await Promise.race([
                    fetch(upsertFileUrl, {
                      method: 'POST',
                      headers: upsertFileHeaders,
                      body: formData
                    }),
                    timeoutPromise,
                  ])) as any;

                  // if (res) {
                  const resJson = await res.json();

                  if (resJson) {
                    console.log('Upserted pdf into db:' + JSON.stringify(resJson) + ' for user: ' + emailAddress)
                  }
                } catch (error) {
                  console.error(error);
                  return null;
                }
              }),
            )

            // Upsert the documents
            const body = JSON.stringify({
              documents: documents,
            });

            // todo no need to map here since the whole package was created as body
            await Promise.all(
              filteredSources.map(async (source) => {
                try {
                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), 60000),
                  );

                  const res = (await Promise.race([
                    fetch(upsertUrl, {
                      method: 'POST',
                      headers: upsertHeaders,
                      body: body
                    }),
                    timeoutPromise,
                  ])) as any;

                  // if (res) {
                  const resJson = await res.json();

                  if (resJson) {
                    console.log('Upserted documents into db:' + JSON.stringify(resJson) + ' for user: ' + emailAddress)
                  }
                } catch (error) {
                  console.error(error);
                  return null;
                }
              }),
            );
          }
        }
      }

      // now we can query the retrieval plugin
      const query = encodeURIComponent(userMessage.content.trim());

      const body = JSON.stringify(
        {
          queries: [
            {
              query: query,
              top_k: 6,
              filter: {
                author: emailAddress,
              }
            }
          ]
        }
      )
      console.log('Querying retrieval plugin with body: ' + body)
      const openaiRetrievalRes = await fetch(
        `${process.env.RETRIEVAL_PLUGIN_URL}/query`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RETRIEVAL_BEARER_KEY}`,
          },
          method: 'POST',
          body: body,
        }
      );

      const openaiRetrievalData = await openaiRetrievalRes.json();

      const sources: OpenaiRetrievalSource[] = openaiRetrievalData["results"][0]["results"].map((item: any) => ({
        url: item.metadata.url,
        sourceId: item.metadata.source_id,
        author: item.metadata.author,
        createdAt: item.metadata.created_at,
        text: item.text,
      }));

      const prompt = endent`
    Provide me with the information I requested. Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as a markdown link as you use them at the end of each sentence by number of the source (ex: [[1]](link.com)). Provide an accurate response and then stop. Today's date is ${new Date().toLocaleDateString()}.
    Important: If there are no sources, respond with "No sources found." and stop. If there are sources but the answer cannot be extracted from them, respond with "Not sure how to respond to that." and stop. If there are sources, and the answer can be extracted from the sources, respond with the information requested and then stop. Do not provide any additional information.
    
    Example Input:
    What's the weather in San Francisco today?

    Example Sources:
    Weather data (https://www.google.com/search?q=weather+san+francisco)
    The current weather in San Francisco is 70 degrees and sunny.

    Example Response:
    It's 70 degrees and sunny in San Francisco today. [[1]](https://www.google.com/search?q=weather+san+francisco)

    Input:
    ${userMessage.content.trim()}

    Sources:
    ${sources.map((source) => {
        return endent`
      ${source.sourceId} (${source.url}):
      ${source.text}\n
      `;
      })}

    Response:
    `;
      console.log("User message: " + userMessage.content.trim())
      console.log("First context retrieved from vector db: " + sources[0]?.text + "...")
      console.log("URLs mentioned in prompt: " + filteredSources.map((source) => source.link).join(", "))
      // const prompt: string = { role: 'user', content: answerPrompt };
      // const { model, messages, key, prompt, temperature } = (await req.json()) as ChatBody;

      // await init((imports) => WebAssembly.instantiate(wasm, imports));
      // const encoding = new Tiktoken(
      //   tiktokenModel.bpe_ranks,
      //   tiktokenModel.special_tokens,
      //   tiktokenModel.pat_str,
      // );

      let promptToSend = `Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as [1](link), etc, as you use them. Maximum 4 sentences.`;
      // if (!promptToSend) {
      //   promptToSend = DEFAULT_SYSTEM_PROMPT;
      // }
      console.log("Prompt to send: " + promptToSend)
      let temperatureToUse = temperature;
      if (temperatureToUse == null) {
        temperatureToUse = DEFAULT_TEMPERATURE;
      }

      // const prompt_tokens = encoding.encode(promptToSend);

      // prune any older messages that don't fit. we keep the most recent ones
      let charCount = promptToSend.length;
      let messagesToSend: Message[] = [];
      messages.push({
        "role": "user",
        "content": prompt,
      })
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        // const tokens = encoding.encode(message.content);
        // a token is about 4 characters
        if (charCount + message.content.length + 4000 > model.tokenLimit * 4) {
          break;
        }
        charCount += message.content.length;
        messagesToSend = [message, ...messagesToSend];
      }

      // encoding.free();

      // const stream = await OpenAIStream(model, promptToSend, temperatureToUse, key, messagesToSend);
      console.log("About to send prompt to completion...")
      const answerRes = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
          ...(process.env.OPENAI_ORGANIZATION && {
            'OpenAI-Organization': process.env.OPENAI_ORGANIZATION,
          }),
        },
        method: 'POST',
        body: JSON.stringify({
          model: model.id,
          messages: messages,
          max_tokens: 1000,
          temperature: temperatureToUse,
          stream: false,
        }),
      });

      const {choices: choices2} = await answerRes.json();
      let answer = choices2[0].message.content;
      console.log("Answer retrieved from completion: " + answer.slice(-300) + "...")

      // Add a message about the urls we fetched to the answer
      if (filteredSources.length > 0) {
        let fetchedUrlsMessage = "[ Saved content from these urls: ";

        // for each entry in filteredSources, add a message to the answer
        for (let i = 0; i < filteredSources.length; i++) {
          fetchedUrlsMessage += `${filteredSources[i].link} `;
        }
        fetchedUrlsMessage += "]\n\n";

        // Add the urls message to the start of the answer
        answer = fetchedUrlsMessage + answer;
      }
      console.log("Done =======")
      res.status(200).json({answer: answer})
      // res.status(200).send(answerRes)
      // return new Response(stream);
    } catch (error) {
      console.error('there was an error: ' + error);
      if (error instanceof OpenAIError) {
        // return new Response('Error', { status: 500, statusText: error.message });
        res.status(500).json({status: 500, statusText: error.message});
      } else {
        // return new Response('Error', { status: 500 });
        res.status(500).json({status: 500});
      }
    }
  }
  //   const answerRes = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
  //       ...(process.env.OPENAI_ORGANIZATION && {
  //         'OpenAI-Organization': process.env.OPENAI_ORGANIZATION,
  //       }),
  //     },
  //     method: 'POST',
  //     body: JSON.stringify({
  //       model: model.id,
  //       messages: [
  //         {
  //           role: 'system',
  //           content: `Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as [1](link), etc, as you use them.`,
  //         },
  //         answerMessage,
  //       ],
  //       max_tokens: 1000,
  //       temperature: 1,
  //       stream: true,
  //     }),
  //   });
  //   const ans = await answerRes.text()
  //   // const result = await ans.json();
  //   // const { choices: choices2 } = result
  //   const answer = choices2[0].message.content;
  //
  //   res.status(200).json({ answer });
  // } catch (error) {
  //   console.error(error);
  //   res.status(500).json({ error: 'Error'})
  // }
};

export default handler;
