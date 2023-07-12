import {DEFAULT_TEMPERATURE} from '@/utils/app/const';
// import { cleanSourceText } from '@/utils/server/google';
import { OpenaiRetrievalBody, OpenaiRetrievalSource } from '@/types/retrieval';
import endent from 'endent';
import { OpenAIError, OpenAIStream } from '@/utils/server';
import { Message } from '@/types/chat';

// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  try {
    const { messages, key, model, temperature} =
        (await req.json()) as OpenaiRetrievalBody;
    const userMessage = messages[messages.length - 1];
    const query = encodeURIComponent(userMessage.content.trim());

    const body = JSON.stringify(
        {
          queries: [
            {
              query: query,
              top_k: 6,
            }
          ]
        }
    )
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
    console.log("Prompt retrieved from silopedia: " + sources[0].text.slice(-300) + "...")
    // const prompt: string = { role: 'user', content: answerPrompt };
    // const { model, messages, key, prompt, temperature } = (await req.json()) as ChatBody;

    await init((imports) => WebAssembly.instantiate(wasm, imports));
    const encoding = new Tiktoken(
      tiktokenModel.bpe_ranks,
      tiktokenModel.special_tokens,
      tiktokenModel.pat_str,
    );

    let promptToSend = `Use the sources to provide an accurate response. Respond in markdown format. Cite the sources you used as [1](link), etc, as you use them. Maximum 4 sentences.`;
    // if (!promptToSend) {
    //   promptToSend = DEFAULT_SYSTEM_PROMPT;
    // }

    let temperatureToUse = temperature;
    if (temperatureToUse == null) {
      temperatureToUse = DEFAULT_TEMPERATURE;
    }

    const prompt_tokens = encoding.encode(promptToSend);

    let tokenCount = prompt_tokens.length;
    let messagesToSend: Message[] = [];
    messages.push({
      "role": "user",
      "content": prompt,
    })
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = encoding.encode(message.content);

      if (tokenCount + tokens.length + 1000 > model.tokenLimit) {
        break;
      }
      tokenCount += tokens.length;
      messagesToSend = [message, ...messagesToSend];
    }

    encoding.free();

    const stream = await OpenAIStream(model, promptToSend, temperatureToUse, key, messagesToSend);

    return new Response(stream);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      return new Response('Error', { status: 500, statusText: error.message });
    } else {
      return new Response('Error', { status: 500 });
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
