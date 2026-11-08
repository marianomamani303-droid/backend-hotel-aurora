import { Client, Environment } from '@paypal/paypal-server-sdk'
const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: process.env.PAYPAL_CLIENT_ID,
    oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET
  },
  environment: process.env.PAYPAL_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  timeout: 15000
})
export default paypalClient
