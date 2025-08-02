const express = require("express");
const cors = require("cors");
require("dotenv").config();
const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);


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
        const paymentsCollection = client.db("courierDesk_db").collection("payments");

        //users api
        app.get('/users', async (req, res) => {
            try {
                const users = await usersCollection.find().toArray();
                res.status(200).json(users);
            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).json({
                    error: 'Internal Server Error'
                });
            }
        });

        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({
                    email
                });
                if (!user) {
                    return res.status(404).send({
                        error: 'User not found'
                    });
                }

                res.send({
                    role: user.role || 'customer'
                });
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({
                    error: 'Internal Server Error'
                });
            }
        })

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

        app.patch('/users/:id/role', async (req, res) => {
            const {
                id
            } = req.params;
            const {
                newRole
            } = req.body;
            const result = await usersCollection.updateOne({
                _id: new ObjectId(id)
            }, {
                $set: {
                    role: newRole
                }
            });
            res.send(result);
        });



        //parcels api
        app.get("/myparcels", async (req, res) => {
            try {
                const senderEmail = req.query.email;

                if (!senderEmail) {
                    return res.status(400).send({
                        error: "Email query parameter is required"
                    });
                }

                const parcels = await parcelsCollection
                    .find({
                        senderEmail
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

                res.send(parcels);
            } catch (error) {
                console.error("Error fetching parcels for user:", error);
                res.status(500).send({
                    error: "Failed to fetch parcels"
                });
            }
        });

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

        // payment api
        app.post('/create-payment-intent', async (req, res) => {
            const {
                totalCost
            } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: totalCost * 100,
                    currency: 'usd',
                    payment_method_types: ['card'],
                });

                res.json({
                    clientSecret: paymentIntent.client_secret
                });
            } catch (error) {
                res.status(500).json({
                    error: error.message
                });
            }
        });

        app.post('/payments', async (req, res) => {
            try {
                const {
                    email,
                    parcelId,
                    totalCost,
                    paymentMethod,
                    transactionId,
                    parcelData
                } = req.body;

                const newParcel = {
                    ...parcelData,
                    statusLogs: [{
                        status: "payment_successful",
                        timestamp: new Date()
                    }],
                    transactionId,
                };

                const parcelResult = await parcelsCollection.insertOne(newParcel);

                const paymentDoc = {
                    email,
                    parcelId,
                    totalCost,
                    paymentMethod,
                    transactionId,
                    paidAt: new Date()
                };

                const paymentResult = await paymentsCollection.insertOne(paymentDoc);

                res.status(201).send({
                    message: "Payment successful and parcel created",
                    insertedParcelId: parcelResult.insertedId,
                    insertedPaymentId: paymentResult.insertedId
                });

            } catch (error) {
                console.error("Payment/Parcel insertion error:", error);
                res.status(500).send({
                    message: "Failed to process prepaid parcel",
                    error: error.message
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