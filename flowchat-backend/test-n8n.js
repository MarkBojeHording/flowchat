require('dotenv').config()
const { testConnection } = require('./src/services/n8n')
testConnection()
