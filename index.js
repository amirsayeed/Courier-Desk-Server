const express = require("express");
const cors = require("cors");
require("dotenv").config();
const {
    MongoClient,
    ServerApiVersion
} = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dse9fiu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();
        const usersCollection = client.db("courierDesk_db").collection("users");
        const parcelsCollection = client.db("courierDesk_db").collection("parcels");

        //users api
        app.post('/users', async (req, res) => {
            try {
                const user = req.body;

                const existing = await usersCollection.findOne({
                    email: user.email
                });

                if (existing) {
                    return res.status(200).json({
                        message: 'User already exists'
                    });
                }

                const result = await usersCollection.insertOne(user);
                res.status(201).json({
                    insertedId: result.insertedId
                });
            } catch (err) {
                console.error('Error adding user:', err);
                res.status(500).json({
                    error: 'Failed to add user'
                });
            }
        });


        //parcels api
        app.post("/parcels", async (req, res) => {
            try {
                const parcel = req.body;

                const result = await parcelsCollection.insertOne(parcel);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error inserting parcel:", error);
                res.status(500).send({
                    error: "Failed to book parcel"
                });
            }
        });


        // await client.db("admin").command({
        //     ping: 1
        // });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Courier Desk server is running')
})

app.listen(port, () => {
    console.log(`CourierDesk server running on port ${port}`);
});