import { MongoClient } from 'mongodb';
import express, { json } from 'express';
import chalk from 'chalk';
import cors from 'cors';
import dayjs from 'dayjs';
import joi from 'joi'

const mongoClient = new MongoClient('mongodb://127.0.0.1:27017/batePapoUol');
const app = express();
const port = 5000;

const userSchema = joi.object({
    name: joi.string().required()
});

start();

async function start() {
    app.use(cors());
    app.use(json());

    app.listen(port, () => {
        console.log(chalk.bold.green(`--------------- Server running on port ${port}`));
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
    const { name } = req.body;

    const validation = userSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    // Validation of empty
    if (name == '') return res.sendStatus(422);

    try {
        const hasUser = await db.collection('participants').findOne({ name });
        if (hasUser) {
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

    if (user === '') return res.sendStatus(422);
    try {
        const userLoggedIn = await db.collection('participants').findOne({ name: user });

        if (!userLoggedIn) {
            console.log(chalk.bold.red(`NOT LOGGED IN -> ${user} tryed to sent a message to ${to} : ${text} - ${dayjs().format('HH:mm:ss')} --- Type: ${type}`));
            return res.sendStatus(422);
        }
    } catch (error) {
        return res.status(500).send(error.message);
    }

    if (!to || !text || !type) return res.sendStatus(422);

    if (to === '' || text === '') return res.sendStatus(422);

    if (type !== "private_message" && type !== "message") return res.sendStatus(422);

    try {
        await db.collection('messages').insertOne({
            from: user,
            to: to,
            text: text,
            type: type,
            time: dayjs().format('HH:mm:ss'),
        });
        console.log(chalk.bgMagenta.red(`User ${user} has sent a message to ${to} : ${text} - ${dayjs().format('HH:mm:ss')} --- Type: ${type}`));
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

            if (isNaN(limit) || (!isNaN(limit) && limit < 0)) return res.sendStatus(422);

            const dbMessages = await db
                .collection('messages')
                .find({ $or: [{ to: 'Todos' }, { to: user }, { from: user }, { type: 'message' },], })
                .toArray();
            return res.send([...dbMessages].reverse().slice(0, limit).reverse());
        } else {
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
