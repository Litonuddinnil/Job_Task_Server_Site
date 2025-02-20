const express = require('express')
require('dotenv').config()
const cors = require('cors')  
const app = express()
const port = process.env.PORT || 5000 
app.use(express.json()) 
app.use(cors());
// Default Route
app.get('/', (req, res) => {
    res.send('Job Task backend is running!')
})

// Start Server
app.listen(port, () => {
    console.log(`Job  Task Portal: ${ port }`)
})