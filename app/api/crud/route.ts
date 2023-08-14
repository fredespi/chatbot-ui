import {getServerSession} from "next-auth/next"
import authOptions from "../../../pages/api/auth/[...nextauth]"
import {NextResponse} from 'next/server'
import {ContextSource} from "@/types/urlContext";
import getLogger from "@/utils/server/logger";

const logger = getLogger();

const upsertUrl = `${process.env.RETRIEVAL_PLUGIN_URL}/upsert`;
const upsertFileUrl = `${process.env.RETRIEVAL_PLUGIN_URL}/upsert-file`;
const deleteUrl = `${process.env.RETRIEVAL_PLUGIN_URL}/delete`;
const authHeader = {
  'Authorization': `Bearer ${process.env.RETRIEVAL_BEARER_KEY}`,
}
const upsertHeaders = {
  ...authHeader,
  'Content-Type': 'application/json'
};
const upsertFileHeaders = {
  ...authHeader,
  // 'Content-Type': 'application/pdf'
};

async function protectEndpointAndGetUserEmail() {
  const session = await getServerSession(authOptions)

  if (!session) {
    throw new Error("You must be signed in to view the protected content on this page.");
  }

  // @ts-ignore
  return session.user.email;
}

export async function DELETE(request: Request) {
  try {
    const emailAddress = await protectEndpointAndGetUserEmail();
    logger.info("User: " + emailAddress)

    // get the body from the request and parse it as JSON
    const body = await request.json();

    // send the body forward to the delete endpoint
    logger.info("Deleting: " + JSON.stringify(body))
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: upsertHeaders,
      body: JSON.stringify(body)
    });

    if (deleteResponse.status !== 200) {
      throw new Error("Error deleting: " + JSON.stringify(body))
    }
    return NextResponse.json("ok")
  } catch (error) {
    console.error('there was an error: ' + error);
    return NextResponse.json({status: 500, message: JSON.stringify(error)});
  }
}

export async function POST(request: Request) {
  try {
    const emailAddress = await protectEndpointAndGetUserEmail();
    logger.info("User: " + emailAddress)

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

      logger.info("Preparing for upsert files: " + fileSources.length)

      // Upsert-file the PDFs
      await Promise.all(
        fileSources.map(async (source) => {
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
          if (!res.ok) {
            // @ts-ignore
            return res.text().then(text => { throw new Error("Error upserting file: " + source.link + " - " + text) })
          }
          const resJson = await res.json();

          if (resJson) {
            logger.info('Upserted file into db ' + source.link + ': ' + JSON.stringify(resJson) +
              ' for user: ' + emailAddress)
          }
        }),
      )
      logger.info("Done uploading files to vector db")
    }
    return NextResponse.json("ok")
  } catch (error: any) {
    console.error('there was an error: ' + error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
