import './dotenv_config';

import * as Database from 'better-sqlite3';
import {info} from 'console';
import * as TelegramBot from 'node-telegram-bot-api';
import {exit} from 'process';
import {ParseMode, SendMessageOptions} from 'node-telegram-bot-api';

console.log('Connecting the database');
const db = new Database('archive/database.sqlite', {verbose: console.log});

console.log('Creating the tables');
db.exec(`
CREATE TABLE IF NOT EXISTS "trip" (
  "id"	INTEGER PRIMARY KEY AUTOINCREMENT,
  "chat_id" TEXT NOT NULL,
  "message_id" TEXT,
  "name"	TEXT NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS "car" (
    "id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trip_id"	INTEGER NOT NULL,
    "user_id"	TEXT NOT NULL,
    "name"	TEXT NOT NULL,
    "passengers" INTEGER,
    "max_passengers" INTEGER
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS "passenger" (
    "id"	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "car_id"	INTEGER NOT NULL,
    "user_id"	TEXT NOT NULL,
    "name"	TEXT NOT NULL
);
`);

console.log('Configuring the token');

if(!process.env.TOKEN)
{
    console.error('No token provided!');
    exit(1);
}

const token = process.env.TOKEN;

console.log(`Token ${token.substring(0, 3)}...${token.substring(token.length - 3)}`);

const bot = new TelegramBot(token, {polling: true});
const parse_mode: ParseMode = 'HTML';

bot.onText(/\/trip(?:@car_organizer_bot)?$/, (msg) =>
{
    const chat_id = msg.chat.id;

    bot.sendMessage(chat_id, 'Please send the command as /trip [name of the trip]');
});

bot.onText(/\/trip(?:@car_organizer_bot)? (.+)/, async (msg, match) =>
{
    const chat_id = msg.chat.id;

    if(!match)
        return;

    const trip_name: string = match[1].trim();

    const insert = db.prepare('INSERT INTO trip (chat_id, name) VALUES (@chat_id, @trip_name)');

    let result;

    try
    {
        result = insert.run({
            chat_id,
            trip_name,
        });
    }
    catch(error)
    {
        console.error(error);
        bot.sendMessage(chat_id, `Operation not completed for unexpected reason!`);
        return;
    }

    const opts = {
        parse_mode,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Add 🚙',
                        callback_data: `add_car_${result.lastInsertRowid}`
                    }
                ]
            ]
        }
    };

    const message = await bot.sendMessage(chat_id, `📆 <b>${trip_name}</b>`, opts);

    const update = db.prepare('UPDATE trip SET message_id = @message_id WHERE id = @id');
    update.run({
        id: result.lastInsertRowid,
        message_id: message.message_id,
    });
});

bot.onText(/\/seats(?:@car_organizer_bot)? ([0-9]+)/, async (msg, match) =>
{
    const chat_id = msg.chat.id;
    const user_id = msg.from?.id;

    if(!user_id)
    {
        bot.sendMessage(chat_id, `Operation not completed, no user id found.`);
        return;
    }

    if(!match)
        return;

    const max_passenger_number: number = parseInt(match[1].trim(), 10);

    const is_car_existing = db.prepare("SELECT car.id, car.trip_id FROM car JOIN trip ON car.trip_id = trip.id where car.user_id = @user_id and trip.chat_id = @chat_id ORDER BY car.id DESC LIMIT 1").get({user_id, chat_id});

    if(!is_car_existing)
    {
        bot.sendMessage(chat_id, `Operation not completed, no car found.`);
        return;
    }

    const trip_id = is_car_existing.trip_id;
    try
    {
        const update = db.prepare('UPDATE car SET max_passengers = @max_passenger_number WHERE id = @id');
        update.run({
            id: is_car_existing.id,
            max_passenger_number,
        });
    }
    catch(error)
    {
        console.error(error);
        bot.sendMessage(chat_id, `Operation not completed for unexpected reason!`);
        return;
    }

    const old_message_reference = db.prepare("SELECT chat_id, message_id FROM trip where trip.id = @trip_id").get({trip_id});
    const cars = db.prepare("SELECT id, name FROM car where trip_id = @trip_id").all({trip_id});

    const cars_button = cars.map(car => ([{
        text: `Join ${car.name}`,
        callback_data: `join_${car.id}`
    }]));

    const opts = {
        chat_id: old_message_reference.chat_id,
        message_id: old_message_reference.message_id,
        parse_mode,
        reply_markup: {
            inline_keyboard: [
                ...cars_button,
                [{
                    text: 'Add 🚙',
                    callback_data: `add_car_${trip_id}`
                }]
            ]
        }
    };

    const text = prepare_text_message(trip_id);
    try
    {
        await bot.editMessageText(text, opts);
    }
    catch(error)
    {
        console.error('Unable to update the chat: ', error.message);
    }
});

bot.onText(/\/name(?:@car_organizer_bot)? ([0-9a-zA-Z]+)/, async (msg, match) =>
{
    const chat_id = msg.chat.id;
    const user_id = msg.from?.id;

    if(!user_id)
    {
        bot.sendMessage(chat_id, `Operation not completed, no user id found.`);
        return;
    }

    if(!match)
        return;

    const name: string = match[1].trim();
    try
    {
        const update_passenger = db.prepare('UPDATE passenger SET name = @name WHERE user_id = @user_id');
        update_passenger.run({
            user_id,
            name,
        });

        const update_car = db.prepare('UPDATE car SET name = @name WHERE user_id = @user_id');
        update_car.run({
            user_id,
            name,
        });
    }
    catch(error)
    {
        console.error(error);
        bot.sendMessage(chat_id, `Operation not completed for unexpected reason!`);
        return;
    }

    const old_message_references = db.prepare("SELECT trip.chat_id, trip.message_id, trip.id FROM trip JOIN car ON trip.id = car.trip_id where car.user_id = @user_id").all({user_id});

    for(const old_message_reference of old_message_references)
    {
        const trip_id =  old_message_reference.id;
        const cars = db.prepare("SELECT id, name FROM car where trip_id = @trip_id").all({trip_id});

        const cars_button = cars.map(car => ([{
            text: `Join ${car.name}`,
            callback_data: `join_${car.id}`
        }]));

        const opts = {
            chat_id: old_message_reference.chat_id,
            message_id: old_message_reference.message_id,
            parse_mode,
            reply_markup: {
                inline_keyboard: [
                    ...cars_button,
                    [{
                        text: 'Add 🚙',
                        callback_data: `add_car_${trip_id}`
                    }]
                ]
            }
        };

        const text = prepare_text_message(trip_id);
        try
        {
            await bot.editMessageText(text, opts);
        }
        catch(error)
        {
            console.error('Unable to update the chat: ', error.message);
        }
    }

    bot.sendMessage(chat_id, `Ok I've update your name in every trip to ${name}`);
});

function prepare_text_message(trip_id: number)
{
    const {name} = db.prepare("SELECT name FROM trip where trip.id = @trip_id").get({trip_id});

    const passengers = db.prepare("SELECT passenger.name as username, car.name as car_name, car.max_passengers as max_passengers FROM passenger JOIN car ON car.id = passenger.car_id where car.trip_id = @trip_id ORDER BY car.name").all({trip_id});

    let text = `📆 <b>${name}</b>\n\n`

    const car_dictionary = {};

    passengers.map(passenger =>
    {
        let s = '';

        if(!(passenger.car_name in car_dictionary))
        {
            car_dictionary[passenger.car_name] = {
                info: {
                    max_passengers: passenger.max_passengers
                },
                passenger: []
            };
        }

        car_dictionary[passenger.car_name].passenger.push(passenger.username);
    });

    for(const car in car_dictionary)
    {
        const is_car_full = car_dictionary[car].passenger.length >= (car_dictionary[car].info.max_passengers || 5) ? true : false;

        text += `${is_car_full ? '🚗' : '🚙'} <b>${car}</b> [${car_dictionary[car].passenger.length}/${car_dictionary[car].info.max_passengers || 5}] ${is_car_full ? '🚫' : ''}:\n`;

        for(const username of car_dictionary[car].passenger)
            text += `- ${username}\n`;

        text += '\n'
    }

    return text;
}

function handle_add_car(callback_query: any, chat_id: number, msg: any, trip_id: number, user_id: number, username: string)
{
    const is_trip_existing = db.prepare("SELECT id FROM trip where chat_id = @chat_id AND id = @trip_id").get({chat_id, trip_id});

    if(!is_trip_existing)
    {
        bot.sendMessage(chat_id, `Operation not completed, no trip found.`);
        return;
    }

    const is_car_existing = db.prepare("SELECT id FROM car where trip_id = @trip_id AND user_id = @user_id").get({trip_id, user_id});

    if(is_car_existing)
    {
        bot.sendMessage(chat_id, `Operation not completed, car already added!`);
        return;
    }

    const insert = db.prepare('INSERT INTO car (trip_id, user_id, name) VALUES (@trip_id, @user_id, @name)');

    try
    {
        insert.run({
            trip_id,
            user_id,
            name: username
        });
    }
    catch(error)
    {
        console.error(error);
        bot.sendMessage(chat_id, `Operation not completed for unexpected reason!`);
        return;
    }

    const cars = db.prepare("SELECT id, name FROM car where trip_id = @trip_id").all({trip_id});

    const cars_button = cars.map(car => ([{
        text: `Join ${car.name}`,
        callback_data: `join_${car.id}`
    }]));

    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        parse_mode,
        reply_markup: {
            inline_keyboard: [
                ...cars_button,
                [{
                    text: 'Add 🚙',
                    callback_data: `add_car_${trip_id}`
                }]
            ]
        }
    };

    const text = prepare_text_message(trip_id);
    bot.editMessageText(text, opts);
}

function handle_jump_in_car(callback_query: any, chat_id: number, msg: any, car_id: number, user_id: number, username: string)
{
    const {trip_id} = db.prepare("SELECT trip_id FROM car where car.id = @car_id").get({car_id});
    const is_passenger_existing = db.prepare("SELECT passenger.id, passenger.car_id FROM passenger JOIN car ON passenger.car_id = car.id where car.trip_id = @trip_id AND passenger.user_id = @user_id").get({trip_id, user_id});

    try
    {
        if(is_passenger_existing)
        {
            if(is_passenger_existing.car_id == car_id)
                return;

            const update = db.prepare('UPDATE passenger SET car_id = @car_id WHERE id = @id');
            update.run({
                id: is_passenger_existing.id,
                car_id,
            });
        }
        else
        {
            const insert = db.prepare('INSERT INTO passenger (car_id, user_id, name) VALUES (@car_id, @user_id, @name)');
            insert.run({
                car_id,
                user_id,
                name: username
            });
        }
    }
    catch(error)
    {
        console.error(error);
        bot.sendMessage(chat_id, `Operation not completed for unexpected reason!`);
        return;
    }

    const text = prepare_text_message(trip_id);

    const cars = db.prepare("SELECT id, name FROM car where trip_id = @trip_id").all({trip_id});
    const cars_button = cars.map(car => ([{
        text: `Join ${car.name}`,
        callback_data: `join_${car.id}`
    }]));

    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        parse_mode,
        reply_markup: {
            inline_keyboard: [
                ...cars_button,
                [{
                    text: 'Add 🚙',
                    callback_data: `add_car_${trip_id}`
                }]
            ]
        }
    };

    bot.editMessageText(text, opts);
}

bot.on('callback_query', (callback_query) =>
{
    if(!callback_query || !callback_query?.message?.chat.id || !callback_query.data)
        return;

    const chat_id = callback_query?.message?.chat.id;
    const action = callback_query.data;
    const from = callback_query.from;
    const msg = callback_query.message;

    console.log(action)
    try
    {
        let username = from?.username;

        if(!username)
        {
            if(from.first_name?.length > 0 && from?.last_name && from.last_name.length > 0)
                username = `${from?.first_name[0]}.${from?.last_name}`;
            else
                username = `ID:${from.id}`;
        }

        if(action.startsWith('add_car_'))
            handle_add_car(callback_query, chat_id, msg, parseInt(action.split('add_car_')[1], 10), from.id, username)

        if(action.startsWith('join_'))
            handle_jump_in_car(callback_query, chat_id, msg, parseInt(action.split('join_')[1], 10), from.id, username);
    }
    catch(error)
    {
        console.error(error);
    }
});

bot.onText(/\/start(?:@car_organizer_bot)?/, (msg) =>
{
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello I\'m car organizer bot!');
});

bot.onText(/\/help(?:@car_organizer_bot)?/, (msg) =>
{
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
Hello I\'m car organizer bot!
I'm here to help you organize an easy trip with your friends!

Steps:
    1. Add @car_organizer_bot to your group of friends
    2. Write <code>/trip name_of_the_trip</code> in the group
    3. Click on the Add Car button to make your car available for your friends
    4. Click on the car of a friends if you want jump in
    5. You can customize the number of seats by typing <code>/seats 4</code>
    6. When every member are in a car you are ready to go!`, {parse_mode});
});
