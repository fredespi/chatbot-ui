import {
  OPENAI_API_HOST,
  OPENAI_API_TYPE,
  OPENAI_API_VERSION,
  OPENAI_ORGANIZATION,
  SECONDARY_OPENAI_API_HOST
} from '@/utils/app/const';

import {OpenAIModel, OpenAIModelID, OpenAIModels} from '@/types/openai';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  async function getModels(url: string, key: string) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(OPENAI_API_TYPE === 'openai' && {
          Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`
        }),
        ...(OPENAI_API_TYPE === 'azure' && {
          'api-key': `${key ? key : process.env.OPENAI_API_KEY}`
        }),
        ...((OPENAI_API_TYPE === 'openai' && OPENAI_ORGANIZATION) && {
          'OpenAI-Organization': OPENAI_ORGANIZATION,
        }),
      },
    });
    return response;
  }

  try {
    const { key } = (await req.json()) as {
      key: string;
    };

    let models: OpenAIModel[]  = []
    let models2: OpenAIModel[]  = []

    // first get openai models
    let url = `${OPENAI_API_HOST}/v1/models`;
    if (OPENAI_API_TYPE === 'azure') {
      url = `${OPENAI_API_HOST}/openai/deployments?api-version=${OPENAI_API_VERSION}`;
    }

    let response = await getModels(url, key);

    if (response.status === 200) {

      let json = await response.json();

      models = json.data
        .map((model: any) => {
          const model_name = (OPENAI_API_TYPE === 'azure') ? model.model : model.id;
          for (const [key, value] of Object.entries(OpenAIModelID)) {
            if (value === model_name) {
              return {
                id: model.id,
                name: OpenAIModels[value].name,
              };
            }
          }
        })
        .filter(Boolean);

    } else {

      console.error(
        `OpenAI API returned an error ${
          response.status
        }: ${await response.text()}`,
      );

    }

    // then get secondary models
    if (SECONDARY_OPENAI_API_HOST) {
      const secondaryUrl = `${SECONDARY_OPENAI_API_HOST}/v1/models`;

      response = await getModels(secondaryUrl, key);

      if (response.status === 200) {

        const json = await response.json();

        models2 = json.data
          .map((model: any) => {
            const model_name = (OPENAI_API_TYPE === 'azure') ? model.model : model.id;
            for (const [key, value] of Object.entries(OpenAIModelID)) {
              if (value === model_name) {
                return {
                  id: model.id,
                  name: OpenAIModels[value].name,
                };
              }
            }
          })
          .filter(Boolean);

      } else {

        console.error(
          `Secondary OpenAI API returned an error ${
            response.status
          }: ${await response.text()}`,
        );

      }
    }

    // merge models
    models2.forEach((model) => {
      if (!models.find((m) => m.id === model.id)) {
        models.push(model);
      }
    })

    if (models.length === 0) {
      return new Response('No models found', { status: 404 });
    }

    return new Response(JSON.stringify(models), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response('Error', { status: 500 });
  }
};

export default handler;
