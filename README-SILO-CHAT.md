# Silo Chat UI
This is an app that allows you to chat with documents that you submit in the chat as URLs. It supports web pages and 
PDFs. It automatically parses the URLs from the chat messages.

## Docker instructions

### Build the docker image 
(if there is an error like ```assertion failed [result.value != EEXIST]: VmTracker attempted to allocate existing mapping``` try turning off rosetta in docker desktop)
```bash
docker build --platform linux/amd64 -t europe-west4-docker.pkg.dev/silogen-dev/silogen-chat/silo-chat-ui:latest .
```

### Test the docker image to see that the server starts correctly (without env.local)
```bash
docker run -p 80:80 europe-west4-docker.pkg.dev/silogen-dev/silogen-chat/silo-chat-ui:latest
```

### Run the docker image
```bash
docker run -p 80:80 --env-file .env.local europe-west4-docker.pkg.dev/silogen-dev/silogen-chat/silo-chat-ui:latest
```

### Push the image to gcp
```bash
docker push europe-west4-docker.pkg.dev/silogen-dev/silogen-chat/silo-chat-ui:latest
```

## How to run
### Prerequisites

## TODO
- [x] Bug: when the vector db is empty or there is no match there is an error
- [x] Bug: if the url contains parentheses it doesn't work (like https://en.wikipedia.org/wiki/Barbie_(film))
- [ ] Feature: Connect another model (a locally running model like llama2) so that we can select it in the model dropdown
- [ ] Deploy everything to GCP with pulumi. probably should have a different project for that
- [x] Feature: Tie the vector db contents to the user account
