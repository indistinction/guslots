const express = require('express')
const { Wallet } = require("@ethersproject/wallet")
const { ImmutableXClient} = require('@imtbl/imx-sdk')
const faunadb = require("faunadb")
const {Create, Collection, Match, Index, Let, Var, Not, If, Exists} = faunadb.query;
const cors = require('cors')
const {CloudflareProvider} = require("@ethersproject/providers");
const fetch = require('node-fetch')
const logger = require('pino')('/home/guslots/log')
const app = express()
const provider = new CloudflareProvider()
const signer = new Wallet(process.env.PK).connect(provider)
const imx = ImmutableXClient.build({
  publicApiUrl: "https://api.x.immutable.com/v1",
  signer: signer,
  starkContractAddress: '0x4527BE8f31E2ebFbEF4fCADDb5a17447B27d2aef',
  registrationContractAddress: '0x6C21EC8DE44AE44D0992ec3e2d9f1aBb6207D864',
  enableDebug: true
})
const fauna = new faunadb.Client({
  secret: process.env.FAUNA,
  domain: 'db.fauna.com',
  port: 443,
  scheme: 'https',
})

const settings = {
  port: 3000,
  targetGods: 12.5
}

function sleep(ms) {
  // Really wish JS had one of these sometimes
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function checkAddFaunaTxn(txnid){
  // Returns false if the txn was already in the db
  // Otherwise returns true
  let res = await fauna.query(
    Let({
        match: Match(Index("txn_by_id"), txnid)
      },
      If(
        Exists(Var('match')),
        Not(Exists(Var('match'))) ,
        Create(Collection('Txns'), {data: {id: txnid}})
      )
    )
  )
  return !!res.data
}

async function doRandomCardTransfer(toAddress){
  // Get list of cards available as prizes
  let assetCursor
  let cardList = []
  do {
    let url = "https://api.x.immutable.com/v1/assets?user=0x7e528a48707271a32e604249560f453db614b174&collection=0xacb3c6a43d15b907e8433077b6d38ae40936fe2c"
    if(assetCursor){
      url += '&cursor='+assetCursor
    }
    const resp = await fetch(url)
    const result = await resp.json()
    if(!resp.ok){
      logger.error(`Cannot send won card to ${toAddress} - error fetching card list ${JSON.stringify(result)}`)
      return {
        error: true,
        message: "Cannot get card list."
      }
    }
    cardList = cardList.concat(result.result)
    assetCursor = result["cursor"]
  } while (assetCursor)

  // Get a random card from the collection
  const cardId = cardList[Math.floor(Math.random()*cardList.length)]["token_id"]

  try{
    const tfr = await (await imx).transfer({
      quantity: "1",
      receiver: toAddress,
      sender: "0x7e528a48707271a32e604249560f453db614b174",
      token: {type: "ERC721", data: {tokenId: cardId, tokenAddress: "0xacb3c6a43d15b907e8433077b6d38ae40936fe2c"}}
    })
    return {txn: tfr["transfer_id"], card: cardId}
  } catch(err) {
    logger.error(`Cannot send won card to ${toAddress} - error processing transfer: ${err.message}`)
    return {
      error: true,
      message: "Cannot process transfer."
    }
  }
}

async function getIMXTxn(txnid) {
  // Sleep is here to give the txn a chance to propagate the IMX servers
  await sleep(3000);
  const resp = await fetch('https://api.x.immutable.com/v1/transfers/' + txnid)
  const result = await resp.json()
  if (resp.ok) {
    logger.info(`getIMXTxn(${txnid}) returned ${JSON.stringify(result)}`)
    return result
  } else {
    logger.error(`getIMXTxn(${txnid}) returned ${JSON.stringify(result)}`)
    return {
      error: true,
      data: result,
      message: "Error fetching txn"
    }
  }
}

async function validateTxn(txnData){
  if(txnData["receiver"]!=="0xb1db53656afc6d191ad841a17dce47dd5cddedb8"){
    logger.error(`txnid ${txnData["txnid"]} not validated: not sent to GU slots address`)
    return {
      success: false,
      error: "This txn was not sent to GUSlots"
    }
  } else if (txnData["status"]!=="success"){
    logger.error(`txnid ${txnData["txnid"]} not validated: txn not successfully completed`)
    return {
      success: false,
      error: "Txn not successful"
    }
  } else if (txnData["token"]["data"]["token_address"]!=="0xccc8cb5229b0ac8069c51fd58367fd1e622afd97"){
    logger.error(`txnid ${txnData["txnid"]} not validated: incorrect currency`)
    return {
      success: false,
      error: "Txn not in $GODS"
    }
  } else if (!(await checkAddFaunaTxn(txnData["txnid"]))){
    logger.error(`txnid ${txnData["txnid"]} not validated: already claimed`)
    return {
      success: false,
      error: "Txn already claimed"
    }
  } else {
    logger.info(`txnid ${txnData["txnid"]} validated, rolling dice...`)
    return {
      success: true,
      user: txnData["user"],
      amt: parseFloat(txnData["token"]["data"]["quantity"])/(10**18),
    }
  }
}

app.use(cors())

app.get('/:txnid', async (request, response) => {
  logger.info(`Incoming request for txnid ${request.params.txnid}`)

  if(
    request.params.txnid === "favicon.ico" ||
    request.params.txnid.startsWith("index") ||
    request.params.txnid.endsWith("php")
  ) {
    response.send("Fuck off.")
  }


  // Get the txn data from IMX
  const txnData = await getIMXTxn(request.params.txnid)
  txnData["txnid"] = request.params.txnid
  if(txnData.error){
    txnData["win"] = false
    await response.json(txnData)
    return
  }
  
  // Check the txn hasn't been seen before and is all OK
  const txnValid = await validateTxn(txnData)
  if (!txnValid.success){
    response.status = 400
    txnValid["win"] = false
    await response.json(txnValid)
  }

  // Decide if the txn is a winner or a loser
  const winTarget = 1.0-Math.min(0.5, txnValid["amt"]/settings["targetGods"])
  const winValue = Math.random()
  logger.info(`txnid ${txnData["txnid"]} needed ${winTarget} and rolled ${winValue}: ${winValue > winTarget ? 'WINNER!' : 'loser'}`)

  if (winValue > winTarget){

    // WINNER!
    // Do card transfer
    const resp = await doRandomCardTransfer(txnValid["user"])
    if(resp.error){
      await response.json({
        win: false
      })
    } else {
      await response.json({
        win: true,
        txn: resp
      })
    }
  } else {
    // Loser
    await response.json({
      win: false
    })
  }
})

app.get('/', (req, res) => {
  res.send('OK.')
})

app.listen(settings.port, () => {
  logger.info(`GUSlots backend started and listening on http://localhost:${settings.port}`)
  console.log(`GUSlots backend started and listening on http://localhost:${settings.port}`)
})