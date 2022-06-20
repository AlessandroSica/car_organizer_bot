#import logging
from slack_sdk.web import WebClient
import os
from dotenv import load_dotenv
load_dotenv()

token= os.getenv('TOKEN')
print(token)

client = WebClient(token)
response = client.chat_postMessage(channel="test-python-bot",text="hello world")
