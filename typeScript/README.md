# Car Organizer Bot

## Telegram Bot

This code in node is the backend of a bot named [@car_organizer_bot](http://telegram.me/car_organizer_bot).
In order to run the bot locally you must create a file named `.env`

With the Token of the bot.

```
TOKEN=xxxxxxxxxx:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
NTBA_FIX_319=1
```

### Start node
To start the bot just write

```
mkdir archive
npm i
npm run start
```

### Docker container
To start the docker container

```
docker build -t car_organizer .
docker run -v ~/archive:/archive -d car_organizer:latest
```

## Preview
![car_trip_output](https://user-images.githubusercontent.com/6942680/131878039-33278302-6d89-408c-aeb1-f0034672b234.gif)


## Usage

`/trip name of the trip`

Click on the buttont 'Add`.

Select the car you want to join.

## Slack Bot
Also the code for the slack bot is present.
Additional information on how to start it and on the different programming languages on which is it written will be avalaible soon.
