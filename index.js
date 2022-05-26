const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
app.use(cors())
app.use(express.json())
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const jwt = require('jsonwebtoken');


const verifyJwt = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized Access" })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden Access" })
        }
        req.decoded = decoded
        next()
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zpz1r.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        await client.connect()

        // Database collection
        const partsCollection = client.db("Assignment_Twelve").collection("CarParts")
        const OrderCollection = client.db("Assignment_Twelve").collection("Order")
        const userCollection = client.db("Assignment_Twelve").collection("User")
        const paymentCollection = client.db("Assignment_Twelve").collection("payments")
        const ReviewCollection = client.db("Assignment_Twelve").collection("Reviews")
        const ProfileCollection = client.db("Assignment_Twelve").collection("Profile")

        // verifyAdmin 
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // All Car Parts get
        app.get('/carParts', async (req, res) => {
            const query = {};
            const cursor = partsCollection.find(query);
            const carParts = await cursor.toArray();
            res.send(carParts);
        })

        // CarParts Details Page
        app.get('/carParts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const part = await partsCollection.findOne(query);
            res.send(part);
        });

        // Add myOrder
        app.post('/myOrder', async (req, res) => {
            const Orders = req.body;
            const result = await OrderCollection.insertOne(Orders);
            res.send(result);
        });

        // Use Token
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const option = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, option)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        })

        // My order Collection
        app.get('/myOrder', verifyJwt, async (req, res) => {
            const email = req.query.email
            const decodedEmail = req.decoded.email
            if (decodedEmail) {
                const query = { email: email }
                const bookings = await OrderCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: "Forbidden Access" })
            }
        })

        // myOrder Delete
        app.delete('/myOrder/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await OrderCollection.deleteOne(query);
            res.send(result);
        });

        // payment id page api
        app.get('/myOrder/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const Order = await OrderCollection.findOne(query);
            res.send(Order);
        });

        // Payment
        app.post('/create-payment-intent', verifyJwt, async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        // pay paid api
        app.patch('/myOrder/:id', verifyJwt, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedOrder = await OrderCollection.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        // Add a Review collection
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await ReviewCollection.insertOne(review);
            res.send(result);
        });

        // All reviews collection
        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = ReviewCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);
        })

        // My Profile
        app.get('/myProfile', verifyJwt, async (req, res) => {
            const email = req.query.email
            const decodedEmail = req.decoded.email
            if (decodedEmail) {
                const query = { email: email }
                const profiles = await ProfileCollection.find(query).toArray()
                return res.send(profiles)
            }
            else {
                return res.status(403).send({ message: "Forbidden Access" })
            }
        })

        // Add Profile
        app.post('/addProfile', async (req, res) => {
            const profile = req.body;
            const result = await ProfileCollection.insertOne(profile);
            res.send(result);
        });

        // update profile 
        app.put('/myProfile', async (req, res) => {
            const email = req.query.email
            const UpdateProfile = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    education: UpdateProfile.education,
                    location: UpdateProfile.location,
                    phone: UpdateProfile.phone,
                    linkedIn: UpdateProfile.linkedIn,
                    github: UpdateProfile.github,
                    img: UpdateProfile.img
                }
            };
            const result = await ProfileCollection.updateOne(filter, updatedDoc, options);
            res.send(result);

        })

        // UseAdmin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // All user collection
        app.get('/user', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        // Make Admin (Update)
        app.put('/user/admin/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: "admin" },
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        // All Orders 
        app.get('/allOrders', async (req, res) => {
            const query = {};
            const cursor = OrderCollection.find(query);
            const allOrders = await cursor.toArray();
            res.send(allOrders);
        })

        // Add Car Parts
        app.post('/addParts', async (req, res) => {
            const parts = req.body;
            const result = await partsCollection.insertOne(parts);
            res.send(result);
        });

        // Manage Car Parts
        app.delete('/CarParts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await partsCollection.deleteOne(query);
            res.send(result);
        });

    }
    finally {

    }
}

run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Mission Assignment 12!!!')
})

app.listen(port, () => {
    console.log(`BackEnd is Running ${port}`)
})
