import {getServerSession} from "next-auth/next"
import authOptions from "../../../pages/api/auth/[...nextauth]"
import {NextResponse} from 'next/server'
import {ContextSource} from "@/types/urlContext";
import getLogger from "@/utils/server/logger";

const logger = getLogger();

export async function POST(request: Request) {
  // in order for this to work, since it is experimental, we need to include the mongo db env var when building the app
  const session = await getServerSession(authOptions)

  if (!session) {
    return new Response('Error', {
      status: 500,
      statusText: "You must be signed in to view the protected content on this page."
    });
  } else {
    // @ts-ignore
    const emailAddress = session.user.email
    logger.info("User: " + emailAddress)
    // const formData = await request.formData();
    // console.log("form data", formData);

    try {
      const formData = await request.formData();
      const formDataEntryValues = Array.from(formData.values());
      const fileSources: ContextSource[] = []
      for (const formDataEntryValue of formDataEntryValues) {
        if (typeof formDataEntryValue === "object" && "arrayBuffer" in formDataEntryValue) {
          const file = formDataEntryValue as unknown as Blob;
          fileSources.push({
            link: file.name,
            text: '',
            file: file,
          })
        }
      }

      const filteredSources = fileSources.filter(Boolean);

      logger.info('Received files: ' + filteredSources.map((source) => source.link))

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

        logger.info("Preparing for upsert files: " + fileSources.length)

        // Upsert-file the PDFs
        await Promise.all(
          fileSources.map(async (source) => {
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
                logger.info('Upserted file into db' + source.link + ': ' + JSON.stringify(resJson) +
                  ' for user: ' + emailAddress)
              }
            } catch (error) {
              console.error(error);
              return null;
            }
          }),
        )
        logger.info("Done uploading files to vector db")
      }
      return NextResponse.json("ok")
    } catch (error) {
      console.error('there was an error: ' + error);
      return NextResponse.json({status: 500, message: JSON.stringify(error)});
    }
  }

}
