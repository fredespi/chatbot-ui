# Silo Chat UI
This is an app that allows you to chat with documents that you submit in the chat as URLs. It supports web pages and 
PDFs. It automatically parses the URLs from the chat messages.

## How to run
### Prerequisites

## TODO
- [ ] Bug: when the vector db is empty or there is no match there is an error
- [ ] Bug: if the url contains parentheses it doesn't work (like https://en.wikipedia.org/wiki/Barbie_(film))
- [ ] Feature: Connect another model (a locally running model like llama2) so that we can select it in the model dropdown
- [ ] Deploy everything to GCP with pulumi. probably should have a different project for that
- [ ] Feature: Tie the vector db contents to the user account
