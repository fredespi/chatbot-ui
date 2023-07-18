# README - SILOPEDIA.md

## Docker instructions

### Build the docker image 
(if there is an error like ```assertion failed [result.value != EEXIST]: VmTracker attempted to allocate existing mapping``` try turning off rosetta in docker desktop)
```bash
docker build --platform linux/amd64 --no-cache -t europe-west1-docker.pkg.dev/silogen-dev/silopedia-bot/silopedia-ui:latest .
```

### Run the docker image
```bash
docker run -p 80:80 europe-west1-docker.pkg.dev/silogen-dev/silopedia-bot/silopedia-ui:latest
```

### Push the image to gcp
```bash
docker push europe-west1-docker.pkg.dev/silogen-dev/silopedia-bot/silopedia-ui:latest
```

## GCP compute engine instructions (we prefer to deploy to kubernetes)
### Delete the instance template
```bash
gcloud compute instance-templates delete silopedia-ui
```

### Create the instance template
You have to edit the RETRIEVAL_PLUGIN_URL to match the internal ip of the retrieval plugin.
```bash
source ./.env.local
gcloud compute instance-templates create-with-container silopedia-ui --container-image=europe-west1-docker.pkg.dev/silogen-dev/silopedia-bot/silopedia-ui:latest --tags=http-server,https-server,allow-port-80 --machine-type e2-standard-2 --container-env OPENAI_API_KEY=${OPENAI_API_KEY},RETRIEVAL_BEARER_KEY=${RETRIEVAL_BEARER_KEY},NEXT_PUBLIC_DEFAULT_TEMPERATURE=${NEXT_PUBLIC_DEFAULT_TEMPERATURE},DEFAULT_MODEL=${DEFAULT_MODEL},RETRIEVAL_PLUGIN_URL=http://10.132.0.8:8080
```

### Create the firewall rule
```bash
gcloud compute firewall-rules create allow-http --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags http-server
gcloud compute firewall-rules create allow-port-80 --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags allow-port-80
```

### Delete the container
```bash
gcloud compute instances delete silopedia-ui
```

### Create the container
```bash
gcloud compute instances create silopedia-ui --zone europe-west1-b --source-instance-template silopedia-ui
```

### Delete the image
```bash
gcloud container images delete europe-west1-docker.pkg.dev/silogen-dev/silopedia-bot/silopedia-ui:latest
```

## Todo
- for some reason we cannot fetch https://python.langchain.com/docs/get_started/introduction.html
- DONE Add a message at the start of an answer when we have saved a url's content to the vector store
- DONE fix temperature. should be 0 by default
- DONE fix port 80 so we don't have to use 3000
- todo how to configure firewall so that only internal ips can reach the retrieval plugin
- todo figure out how to delete an artifact from command line and add that to the deploy_to_gcp.sh scripts
- todo fix so we use https
- todo fix links to sources so they open in a new tab
