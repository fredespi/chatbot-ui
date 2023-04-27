#!/bin/bash

# done fix temperature. should be 0 by default
# done fix port 80 so we don't have to use 3000
# todo how to configure firewall so that only internal ips can reach the retrieval plugin
# todo figure out how to delete an artifact from command line and add that to the deploy_to_gcp.sh scripts
# todo fix so we use https
# todo fix links to sources so they open in a new tab

source ./.env.local

# build the docker image
# docker build -t europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silopedia-ui:1.0 .

# push the image to gcp
# docker push europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silopedia-ui:1.0

# delete the instance template
# gcloud compute instance-templates delete silopedia-ui

# create the instance template
# gcloud compute instance-templates create-with-container silopedia-ui --container-image=europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silopedia-ui:1.0 --tags=http-server,https-server,allow-port-80 --machine-type e2-standard-2 --container-env OPENAI_API_KEY=${OPENAI_API_KEY},RETRIEVAL_BEARER_KEY=${RETRIEVAL_BEARER_KEY},NEXT_PUBLIC_DEFAULT_TEMPERATURE=${NEXT_PUBLIC_DEFAULT_TEMPERATURE},DEFAULT_MODEL=${DEFAULT_MODEL},RETRIEVAL_PLUGIN_URL=http://10.132.0.8:8080

# create the firewall rule
# gcloud compute firewall-rules create allow-http --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags http-server
# gcloud compute firewall-rules create allow-port-80 --allow tcp:80 --source-ranges 0.0.0.0/0 --target-tags allow-port-80

# delete the container
# gcloud compute instances delete silopedia-ui

# create the container
# gcloud compute instances create silopedia-ui --zone europe-west1-b --source-instance-template silopedia-ui




# not necessary
# delete the image
# gcloud container images delete europe-west1-docker.pkg.dev/silogen-dev/silogen-dev/silopedia-ui:1.0