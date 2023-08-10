import {getServerSession} from "next-auth/next"
import authOptions from "./auth/[...nextauth]"
import {DEFAULT_TEMPERATURE, OPENAI_API_HOST, SAVE_CONTEXT_URLS, SECONDARY_OPENAI_API_HOST} from '@/utils/app/const';
// import { cleanSourceText } from '@/utils/server/google';
import {OpenaiRetrievalBody, OpenaiRetrievalDocument, OpenaiRetrievalSource} from '@/types/retrieval';
import endent from 'endent';
import {OpenAIError, OpenAIStream} from '@/utils/server';
//import {experimental_buildLlama2Prompt} from '@/utils/server/llama2';
import {Message} from '@/types/chat';

// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import {Tiktoken, init} from '@dqbd/tiktoken/lite/init';
import jsdom, {JSDOM} from "jsdom";
import {Readability} from "@mozilla/readability";
import {cleanSourceText} from "@/utils/server/google";
import {ContextSource} from "@/types/urlContext";
import {NextApiRequest, NextApiResponse} from "next";
import winston from "winston";
import {OpenAIModelID} from "@/types/openai";

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    winston.format.printf(({level, message, timestamp, ...metadata}) => {
      const metaString = Object.keys(metadata).length ? `\n${JSON.stringify(metadata, null, 2)}` : '';
      return `${timestamp} ${level}: ${message}${metaString}`;
    })
  ),
  transports: [
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

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
    logger.info("User: " + emailAddress)
    try {
      const {messages, key, model, temperature} =
        (await req.body) as OpenaiRetrievalBody;

      // we want to remove the last message since we will reformat it to a userMessageToSend below
      const userMessage = messages[messages.length - 1];
      if (messages.length > 0) {
        messages.pop()
      }

      // If the SAVE_CONTEXT_URLS env var is set, we'll try to fetch the text of any URLs in the user's message
      // and upsert them into the retrieval plugin vector db.
      let filteredSources: ContextSource[] = [];
      if (SAVE_CONTEXT_URLS) {
        const urlPattern = new RegExp('(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#\/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#\/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#\/%\(\)=~_|$?!:,.]*\)|[A-Z0-9+&@#\/%\(\)=~_|$])', 'gi');
        const urls = userMessage.content.match(urlPattern) || []

        const urlContextSources: ContextSource[] = urls.map((item: any) => ({
          link: item,
          text: '',
          file: '',
        }));

        logger.info('Found urls: ' + urlContextSources)
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
                    file: pdfBuffer,
                  } as ContextSource;
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
                  } as ContextSource;
                }

                return null;
              } catch (error) {
                console.error(error);
                return null;
              }
            }),
          );

          filteredSources = urlContextSourcesWithText.filter(Boolean);

          logger.info('Fetched urls as pages or pdfs' + filteredSources)

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
              if (!source.file) {
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

            logger.info("Preparing for upsert document urls: " + documents.length)

            // Collect all the sources that are PDFs
            const pdfs: ContextSource[] = filteredSources.filter((source) => source.file);
            logger.info("Preparing for upsert PDF urls: " + pdfs.length)


            // Upsert-file the PDFs
            await Promise.all(
              pdfs.map(async (source) => {
                try {
                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), 60000),
                  );

                  const formData = new FormData();
                  formData.append('file', source.file)
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
                    logger.info('Upserted pdf into db:' + JSON.stringify(resJson) + ' for user: ' + emailAddress)
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
                    logger.info('Upserted documents into db:' + JSON.stringify(resJson) + ' for user: ' + emailAddress)
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

      const body =
        {
          queries: [
            {
              query: query,
              top_k: 4,
              filter: {
                author: emailAddress,
              }
            }
          ]
        }

      logger.info('Querying retrieval plugin with body: ', body)
      // console.dir(body, {depth: null})
      const openaiRetrievalRes = await fetch(
        `${process.env.RETRIEVAL_PLUGIN_URL}/query`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RETRIEVAL_BEARER_KEY}`,
          },
          method: 'POST',
          body: JSON.stringify(body),
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

      // log the first few lines of each result
      logger.info('Vector db result count: ' + sources.length)
      sources.forEach((source: any) => {
        logger.info('\t' + source.sourceId + ': ' + source.text.slice(0, 200))
      })

      const systemPrompt = endent
        `
        Provide me with the information I requested. Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as a markdown link as you use them at the end of each sentence by number of the source (ex: [[1]](link.com)). Provide an accurate response and then stop. Today's date is ${new Date().toLocaleDateString()}.
        Important: If there are no sources, respond with "No sources found." and stop. If there are sources but the answer cannot be extracted from them, respond with "Not sure how to respond to that." and stop. If there are sources, and the answer can be extracted from the sources, respond with the information requested and then stop. Do not provide any additional information.
        
        Example Input:
        What's the weather in San Francisco today?
    
        Example Sources:
        \"Weather data\" (https://www.google.com/search?q=weather+san+francisco):
        The current weather in San Francisco is 70 degrees and sunny.
    
        Example Response:
        It's 70 degrees and sunny in San Francisco today. [[1]](https://www.google.com/search?q=weather+san+francisco)
        `;
      const sourcesString = sources.map((source) => {
        return endent`${source.sourceId} (${source.url}):
          ${source.text}
          `;
      }).join('\n');
      const userMessageToSend = endent`
        Input:
        ${userMessage.content.trim()}
        
        Sources:
        ${sourcesString}
        
        Response:
        `
      logger.info("userMessageToSend:\n<<starts below>>\n" + userMessageToSend + "\n<<ends above>>")
      logger.info("URLs mentioned in prompt: " + filteredSources.map((source) => source.link).join(", "))
      // const prompt: string = { role: 'user', content: answerPrompt };
      // const { model, messages, key, prompt, temperature } = (await req.json()) as ChatBody;

      // await init((imports) => WebAssembly.instantiate(wasm, imports));
      // const encoding = new Tiktoken(
      //   tiktokenModel.bpe_ranks,
      //   tiktokenModel.special_tokens,
      //   tiktokenModel.pat_str,
      // );

      // let promptToSend = `Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as [1](link), etc, as you use them. Maximum 4 sentences.`;
      // if (!promptToSend) {
      //   promptToSend = DEFAULT_SYSTEM_PROMPT;
      // }
      // logger.info("Prompt to send: " + promptToSend)
      let temperatureToUse = temperature;
      if (temperatureToUse == null) {
        temperatureToUse = DEFAULT_TEMPERATURE;
      }

      // const prompt_tokens = encoding.encode(promptToSend);

      // prune any older messages that don't fit. we keep the most recent ones
      let charCount = systemPrompt.length;
      let messagesToSend: Message[] = [];
      messages.push({
        "role": "user",
        "content": userMessageToSend,
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
      // const llamaMessagesToSend: Message[] = [
      //     {
      //       role: 'system',
      //       content: systemPrompt,
      //     },
      //     ...messagesToSend,
      //   ]
      // const llamaMessagesPrompt = experimental_buildLlama2Prompt(llamaMessagesToSend)
      // logger.info("llamaMessages prompt:\n<<starts below>>\n" + llamaMessagesPrompt + "\n<<ends above>>")
      const promptBody = {
        model: model.id,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...messagesToSend,
        ],
        max_tokens: 1000,
        temperature: temperatureToUse,
        stream: true,
      }

      logger.info("About to send prompt to completion: ", promptBody)

      const stream = await OpenAIStream(model, systemPrompt, temperatureToUse, `${key ? key : process.env.OPENAI_API_KEY}`, messagesToSend);

      // from https://github.com/vercel/next.js/discussions/46058
      const reader = stream.getReader();

      const processStream = async () => {
        try {
          while (true) {
            const {value, done} = await reader.read();
            if (done) {
              break;
            }
            res.write(value);
          }
        } catch (error) {
          console.error('Error reading stream:', error);
          res.status(500);
        } finally {
          res.end();
        }
      };

      await processStream();
      logger.info("Stream ended")
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
