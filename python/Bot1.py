import logging
import time
from slack_sdk.web import WebClient
import os
from dotenv import load_dotenv
load_dotenv()

token= os.getenv('TOKEN')
client = WebClient(token)
while(1):
    if (time.strftime('%H:%M', time.localtime()) == ("18:25")):
        response = client.chat_postMessage(channel="test-python-bot", text="Now it is 12:30. What do you want to eat for lunch?")
        time.sleep(60)
