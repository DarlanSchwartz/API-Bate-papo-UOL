import { MongoClient } from 'mongodb';
import express, { json } from 'express';
import chalk from 'chalk';
import cors from 'cors';
import dayjs from 'dayjs';
import joi from 'joi';
import dotenv from 'dotenv';
import { stripHtml } from 'string-strip-html';
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
const app = express();

start();

async function start() {

    app.use(cors());
    app.use(json());

    app.listen(process.env.PORT, () => {
        console.log(chalk.bold.green(`--------------- Server running on port ${process.env.PORT}`));
    });

    try {
        await mongoClient.connect();
        console.log(chalk.bold.blue('--------------- MongoDB Connected!'));
    } catch (err) {
        console.log(chalk.bold.red(err.message));
    }
}

const db = mongoClient.db();


// ---------------- POST ---------------

app.post('/participants', async (req, res) => {

    // Validation of undefined
    let { name } = req.body;

    if(name)
    {
        name = stripHtml(name).result.trim();
    }

    const userSchema = joi.object({
        name: joi.any().required()
    });

    const validation = userSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const hasUser = await db.collection('participants').findOne({ name });
        if (hasUser) {
            console.log(chalk.bold.red(`USER ${name} TRIED TO LOGIN WHILE LOGGED IN`));
            return res.status(409).send('User already exists!');
        }
        else {
            await db.collection('participants').insertOne({
                name,
                lastStatus: Date.now()
            });

            await db.collection('messages').insertOne({
                from: name,
                to: 'Todos',
                text: 'entra na sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss'),
            });

            return res.sendStatus(201);
        }
    } catch (error) {
        return res.status(500).send(error.message);
    }
});

app.post('/messages', async (req, res) => {

    const { to, text, type } = req.body;
    const { user } = req.headers;

    if (user === '') {
        console.log(chalk.bold.red(`USER ${user} TRIED TO SENT MESSAGE WITHOUT A HEADER NAME`));
        return res.sendStatus(422);
    }

    
    try {
        const userLoggedIn = await db.collection('participants').findOne({ name: user });

        if (!userLoggedIn) {
            console.log(chalk.bold.red(`NOT LOGGED IN -> ${user} tried to sent a message to ${to} : ${text} - ${dayjs().format('HH:mm:ss')} --- Type: ${type}`));
            return res.sendStatus(422);
        }
    } catch (error) {
        return res.status(500).send(error.message);
    }

    const messageSchema = joi.object({
        to:joi.string().required(),
        text:joi.string().required(),
        type:joi.string().required()
    });

    const validation = messageSchema.validate(req.body,{abortEarly:false});

    if(validation.error)
    {
        const errors = validation.error.details.map((detail) => detail.message);
        console.log(chalk.bold.red(`USER ${user} TRIED TO SENT MESSAGE WITHOUT or WITH SOME INVALID PARAMETERS`));
        return res.status(422).send(errors);
    }

    if(type !== 'private_message' && type !== 'message')
    {
        console.log(chalk.bold.red(`USER ${user} TRIED TO SENT MESSAGE WITHOUT or WITH SOME INVALID PARAMETERS`));
        return res.status(422).send('Invalid message type!');
    }

    try {
        await db.collection('messages').insertOne({
            from: user,
            to: stripHtml(to).result.trim(),
            text: stripHtml(text).result.trim(),
            type: stripHtml(type).result.trim(),
            time: dayjs().format('HH:mm:ss')
        });
        console.log(chalk.bgBlueBright.green(`User ${user} has sent a message to ${to} : ${text} - ${dayjs().format('HH:mm:ss')} --- Type: ${type}`));
        return res.sendStatus(201);
    } catch (error) {
        return res.status(500).send(error.message);
    }
});

app.post('/status', async (req, res) => {
    const { user } = req.headers;
    try {
        const userLoggedIn = await db.collection('participants').findOne({ name: user });
        if (userLoggedIn) {
            await db.collection('participants').updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
            return res.sendStatus(200);
        }

        return res.sendStatus(404);

    } catch (error) {
        return res.status(500).send(error.message);
    }
});


// ---------------- GET ---------------
app.get('/participants', async (req, res) => {
    try {
        const participants = await db.collection('participants').find().toArray();
        console.log(chalk.bold.green(`Requested all participants`));
        return res.status(200).send(participants);
    } catch (error) {
        return res.status(500).send(error.message);
    }
});

app.get('/messages', async (req, res) => {
    try {
        const { limit } = req.query;
        const { user } = req.headers;
        if (limit) {

            if (isNaN(limit) || (!isNaN(limit) && limit <= 0)) return res.sendStatus(422);

            const dbMessages = await db
                .collection('messages')
                .find({ $or: [{ to: 'Todos' }, { to: user }, { from: user }, { type: 'message' },], })
                .toArray();
            console.log(chalk.bold.green(`User ${user} has requested ${limit} messages`));
            return res.send([...dbMessages].reverse().slice(0, limit).reverse());
        } else {
            console.log(chalk.bold.green(`User ${user} has requested all messages`));
            const dbMessages = await db
                .collection('messages')
                .find({ $or: [{ to: 'Todos' }, { to: user }, { from: user }] })
                .toArray();
            return res.send([...dbMessages]);
        }
    } catch (error) {
        return res.status(500).send(error.message);
    }
});




setInterval(async () => {
    try {
        const participants = await db.collection('participants').find({ lastStatus: { $lte: Date.now() - 10000 } }).toArray();

        participants.forEach(async (participant) => {
            
            await db.collection('messages').insertOne({
                from: participant.name,
                to: 'Todos',
                text: `sai da sala...`,
                type: 'status',
                time: dayjs().format('HH:mm:ss'),
            });

            db.collection('participants').deleteOne({
                name: participant.name,
            });
        });

    } catch (error) {
        console.log(chalk.bold.red(error.message));
    }
}, 15000);

