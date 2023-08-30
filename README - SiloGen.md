# README - SILOGEN
This is a frontend app for chatting with an LLM that extracts its answers from documents stored in a vector database. It
has various settings and features that can be set or toggled using environment variables:
- SAVE_CONTEXT_URLS (default: false): if this is true, the user is able to paste URLs to webpages or PDF files in their messages. Any such
files will be fetched and scraped and saved in the vector database under the user's account. There will also be a file
upload icon in the message box that can be used to upload files to the vector database. And there will be a widget
in the left menu that can be used to empty the personal index.
- APP_DESCRIPTION (default: 'A SiloGen app to chat with LLMs.'): sets the description in the HTML `<head/><meta name="description"/>` tag.
- APP_TITLE (default: 'SiloGen Chat'): set the title in the HTML `<head/><title>` tag as well as below the logo on the front page.
- RETRIEVAL_PLUGIN_URL: the url to the retrieval plugin. This is used to fetch the context for the LLM. It provides an
easy-to-use API for submitting or fetching contexts. It wraps whichever vector database that is being used.
- RETRIEVAL_BEARER_KEY: the authentication key for the retrieval plugin
- NEXTAUTH_SECRET: the secret used by next-auth for authentication. See the .env.local.example file.
- NEXTAUTH_URL: the url the app will run on. This is used by next-auth for authentication. See the .env.local.example file.
- GOOGLE_ID: the google id for the google authentication app used by next-auth for authentication
- GOOGLE_SECRET: the google secret for the google authentication app used by next-auth for authentication
- MONGODB_URI: the uri to the mongodb database used for storing user accounts used for authentication
- SECONDARY_OPENAI_API_HOST: an optional http url for a second openai compatible LLM

## Prerequisites
- See the original README.md for prerequisites
- vector database
- retrieval plugin

## Docker instructions

### Build the docker image 
(if there is an error like ```assertion failed [result.value != EEXIST]: VmTracker attempted to allocate existing mapping``` 
on macOS, try turning off rosetta in docker desktop).
If there is an error from mongo db during building it's ok. See the dockerfile for more information.
```bash
docker build --platform linux/amd64 -t europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest . 2>&1 | tee build.log
```

### Test the docker image to see that the server starts correctly (without env.local)
```bash
docker run -p 80:80 --rm europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest
```

### Run the docker image
```bash
docker run -p 80:80 --env-file .env.local --rm europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest
```

### Push the image to gcp
```bash
docker push europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest
```

## GCP compute engine instructions (we prefer to deploy to kubernetes)
### Delete the instance template
```bash
gcloud compute instance-templates delete silogen-chat-ui
```

### Create the instance template
You have to edit the RETRIEVAL_PLUGIN_URL to match the internal ip of the retrieval plugin.
```bash
source ./.env.local
gcloud compute instance-templates create-with-container silogen-chat-ui --container-image=europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest --tags=http-server,https-server,allow-port-80 --machine-type e2-standard-2 --container-env OPENAI_API_KEY=${OPENAI_API_KEY},RETRIEVAL_BEARER_KEY=${RETRIEVAL_BEARER_KEY},NEXT_PUBLIC_DEFAULT_TEMPERATURE=${NEXT_PUBLIC_DEFAULT_TEMPERATURE},DEFAULT_MODEL=${DEFAULT_MODEL},RETRIEVAL_PLUGIN_URL=http://10.132.0.8:8080
```

### Create the firewall rule
```bash
gcloud compute firewall-rules create allow-http --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags http-server
gcloud compute firewall-rules create allow-port-80 --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags allow-port-80
```

### Delete the container
```bash
gcloud compute instances delete silogen-chat-ui
```

### Create the container
```bash
gcloud compute instances create silogen-chat-ui --zone europe-west1-b --source-instance-template silogen-chat-ui
```

### Delete the image
```bash
gcloud container images delete europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silogen-chat-ui:latest
```

## Todo
- for some reason we cannot fetch https://python.langchain.com/docs/get_started/introduction.html
- [x] Add a message at the start of an answer when we have saved a url's content to the vector store
- [x] fix temperature. should be 0 by default
- [x] fix port 80 so we don't have to use 3000
- [ ] how to configure firewall so that only internal ips can reach the retrieval plugin
- [ ] fix so we use https
- [ ] fix links to sources so they open in a new tab
- [x] Bug: when the vector db is empty or there is no match there is an error
- [x] Bug: if the url contains parentheses it doesn't work (like https://en.wikipedia.org/wiki/Barbie_(film))
- [x] Feature: Connect another model (a locally running model like llama2) so that we can select it in the model dropdown
- [ ] Deploy everything to GCP with pulumi. probably should have a different project for that
- [x] Feature: Tie the vector db contents to the user account