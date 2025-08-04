const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
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


const serviceAccount = require("./firebase-admin-service-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


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


        const verifyFbToken = async (req, res, next) => {
            const authHeader = req.headers?.authorization;
            // console.log(authHeader);

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).send({
                    message: 'unauthorized access'
                });
            }

            const token = authHeader.split(' ')[1];

            try {
                const decoded = await admin.auth().verifyIdToken(token);
                //console.log('decoded token', decoded);
                req.decoded = decoded;
                next();
            } catch (error) {
                //console.log(error);
                return res.status(403).send({
                    message: 'forbidden access'
                });
            }
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = {
                email
            };

            const user = await usersCollection.findOne(query);

            if (!user || user.role !== 'admin') {
                return res.status(403).send({
                    message: 'forbidden access'
                })
            }
            next();
        }

        const verifyAgent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = {
                email
            };

            const user = await usersCollection.findOne(query);

            if (!user || user.role !== 'delivery_agent') {
                return res.status(403).send({
                    message: 'forbidden access'
                })
            }
            next();
        }


        //users api
        app.get('/users', verifyFbToken, verifyAdmin, async (req, res) => {
            try {
                const role = req.query.role;
                const query = role ? {
                    role
                } : {};

                const users = await usersCollection.find(query).toArray();

                res.status(200).json(users);
            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).json({
                    error: 'Internal Server Error'
                });
            }
        });

        app.get('/users/:email/role', verifyFbToken, async (req, res) => {
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

        app.patch('/users/:id/role', verifyFbToken, verifyAdmin, async (req, res) => {
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
        app.get("/parcels", verifyFbToken, verifyAdmin, async (req, res) => {
            try {
                const parcels = await parcelsCollection
                    .find({})
                    .sort({
                        createdAt: -1
                    })
                    .limit(10)
                    .toArray();

                res.send(parcels);
            } catch (error) {
                console.error("Error fetching parcels:", error);
                res.status(500).send({
                    error: "Failed to fetch parcels"
                });
            }
        });

        app.patch("/parcels/:id/assign-agent", verifyFbToken, verifyAdmin, async (req, res) => {
            const {
                id
            } = req.params;
            const {
                assignedAgentId,
                assignedAgentEmail
            } = req.body;

            try {
                const result = await parcelsCollection.updateOne({
                    _id: new ObjectId(id)
                }, {
                    $set: {
                        assignedAgentId,
                        assignedAgentEmail,
                        deliveryStatus: "Assigned",
                    },
                    $push: {
                        statusLogs: {
                            status: "Assigned",
                            timestamp: new Date(),
                        },
                    },
                });

                res.send(result);
            } catch (err) {
                console.error("Failed to assign agent:", err);
                res.status(500).send({
                    error: "Failed to assign agent"
                });
            }
        });


        app.get("/myparcels", verifyFbToken, async (req, res) => {
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

        app.get("/agentassignedparcels", verifyFbToken, verifyAgent, async (req, res) => {
            const {
                email
            } = req.query;

            if (!email) {
                return res.status(400).json({
                    error: "Email query parameter is required"
                });
            }

            try {
                const assignedParcels = await parcelsCollection
                    .find({
                        assignedAgentEmail: email
                    })
                    .sort({
                        createdAt: -1
                    })
                    .toArray();

                res.status(200).json(assignedParcels);
            } catch (error) {
                console.error("Error fetching assigned parcels:", error);
                res.status(500).json({
                    error: "Failed to fetch assigned parcels"
                });
            }
        });

        app.patch("/update-parcel-status/:id", verifyFbToken, verifyAgent, async (req, res) => {
            const {
                id
            } = req.params;
            const {
                newStatus
            } = req.body;

            try {
                const parcel = await parcelsCollection.findOne({
                    _id: new ObjectId(id)
                });

                if (!parcel) {
                    return res.status(404).send({
                        error: "Parcel not found"
                    });
                }

                if (
                    newStatus === "Failed" &&
                    !["Picked Up", "In Transit"].includes(parcel.deliveryStatus)
                ) {
                    return res.status(400).send({
                        error: "Cannot mark parcel as Failed before it is Picked Up or In Transit"
                    });
                }

                const updateFields = {
                    deliveryStatus: newStatus,
                };

                const statusLogEntry = {
                    status: newStatus,
                    timestamp: new Date(),
                };

                const updateQuery = {
                    $set: updateFields,
                    $push: {
                        statusLogs: statusLogEntry,
                    },
                };

                if (
                    newStatus === "Delivered" &&
                    parcel.paymentMethod === "COD" &&
                    parcel.paymentStatus !== "paid"
                ) {
                    updateQuery.$set.paymentStatus = "paid";
                    updateQuery.$push.statusLogs = {
                        ...statusLogEntry,
                        status: "payment_received",
                    };
                }

                const result = await parcelsCollection.updateOne({
                        _id: new ObjectId(id)
                    },
                    updateQuery
                );

                res.send(result);
            } catch (err) {
                console.error("Failed to update status:", err);
                res.status(500).send({
                    error: "Failed to update parcel status"
                });
            }
        });


        app.post("/parcels", verifyFbToken, async (req, res) => {
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
        app.post('/create-payment-intent', verifyFbToken, async (req, res) => {
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

        app.post('/payments', verifyFbToken, async (req, res) => {
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


        // statistics
        app.get('/admin/statistics', verifyFbToken, verifyAdmin, async (req, res) => {
            try {
                const today = new Date();
                const startOfDay = new Date(today.setUTCHours(0, 0, 0, 0)).toISOString();
                const endOfDay = new Date(today.setUTCHours(23, 59, 59, 999)).toISOString();

                const bookingsToday = await parcelsCollection.countDocuments({
                    createdAt: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                });

                const failedDeliveries = await parcelsCollection.countDocuments({
                    deliveryStatus: "Failed"
                });

                const inTransitParcels = await parcelsCollection.countDocuments({
                    deliveryStatus: "In Transit"
                });

                const deliveredParcels = await parcelsCollection.countDocuments({
                    deliveryStatus: "Delivered"
                });

                const [codCollectedAgg] = await parcelsCollection.aggregate([{
                        $match: {
                            paymentMethod: "COD",
                            paymentStatus: "paid"
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            codCollected: {
                                $sum: "$totalCost"
                            }
                        }
                    }
                ]).toArray();
                const codCollected = codCollectedAgg?.codCollected || 0;

                const totalParcels = await parcelsCollection.countDocuments();

                res.send({
                    bookingsToday,
                    inTransitParcels,
                    deliveredParcels,
                    failedDeliveries,
                    codCollected,
                    totalParcels
                });
            } catch (error) {
                console.error("Error fetching dashboard statistics:", error);
                res.status(500).send({
                    error: "Failed to fetch statistics"
                });
            }
        })


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