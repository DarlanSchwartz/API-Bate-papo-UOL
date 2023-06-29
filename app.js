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

async function start()
{
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

app.post('/participants', async (req,res)=>{

    // Validation of undefined
    const {name} = req.body;

    const validation = userSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    // Validation of empty
    if(name == '') return res.sendStatus(422);

    try {
        const hasUser = await db.collection('participants').findOne({ name });
        if(hasUser)
        {
            return res.status(409).send('User already exists!');
        }
        else
        {
            await db.collection('participants').insertOne({
                name,
                lastStatus:Date.now()
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

app.post('/messages',  (req,res)=>{

});

app.post('/status',  (req,res)=>{

});


// ---------------- GET ---------------
app.get('/participants',  async (req,res)=>{
    try {
        const participants = await db.collection('participants').find().toArray();
        return res.status(200).send(participants);
    } catch (error) {
        return res.status(500).send(error.message);
    }
});

app.get('/messages',  (req,res)=>{
    
});

