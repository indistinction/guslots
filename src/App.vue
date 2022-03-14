<template>
  <div class="overlay" v-if="showoverlay">
    <div class="overlay-container">
      <div>
        <div style="width: 100%; text-align: right;font-weight: bold;font-size: 1.5em;cursor: pointer;"><span @click="showoverlay=false" v-if="overlaybutton">&times;</span></div>
        <h2>{{overlaytitle}}</h2>
        <p v-html="overlaymessage"  class="overlay-content"/>
        <p>
          <button @click="showoverlay=false" v-if="overlaybutton">Close</button>
        </p>
      </div>
    </div>
  </div>
  <div class="container">
    <h1>Gods Unchained Slots</h1>
    <div class="slotholder">
      <img src="/manslot.png" id="slot">
      <div id="spinner" :style="`background-position-y: -${spintop}px;`">&nbsp;</div>
    </div>
  </div>
  <div class="below">
    <p>Win GU Genesis cards - <a href="javascript:void(0)" @click="showprizes">click here</a> for a list of possible prizes</p>
    <h2>Choose your odds...</h2>
    <div>
      <input type="range" min="0.1" :max="tgtGods/2" step="0.1" v-model="gods" class="slider">
    </div>
    <p>
      <strong>$GODS cost:</strong> {{parseFloat(gods).toFixed(1)}}<br>
      <strong>Odds of winning:</strong> {{(Math.min(50, (gods/tgtGods)*100)).toFixed(0)}}%
    </p>
    <div>
      <button @click="buy">Click to spin the wheel, motherfucker!</button>
    </div>
  </div>
</template>

<script>
import { ImmutableXClient,
   Link,
  ERC20TokenType } from '@imtbl/imx-sdk';

const prizerank = {
  "Diamond":1,
  "Gold":2,
  "Shadow":3,
  "Meteorite":4
}

export default {
  name: 'App',
  data(){
    return{
      tgtGods: 12.5,
      gods: 1,
      spinning: false,
      spintop:0,
      link: null,
      address: null,
      prizes:{},
      prizeArray:[],
      overlaytitle: "Loading...",
      overlaymessage: "Fetching prizes",
      overlaybutton: false,
      showoverlay: true
    }
  },
  methods:{
    spin(){
      if(this.spinning){
        this.spintop += 5
        setTimeout(this.spin, 10)
      } else {
        this.spintop = 0
      }
    },
    nowin(){
      this.spinning = false
      this.spintop = 0
      this.overlaytitle = "Unlucky"
      this.overlaymessage = "Sorry, you didn't win this time."
      this.showoverlay = true
    },
    showprizes(){
      this.overlaytitle = "Available prizes..."
      this.overlaymessage = ""

      for (const property in this.prizes) {
        this.overlaymessage += `${this.prizes[property]} &times; <span class="color${property.substring(0,1)}">${property.substring(1)}</span><br>`
      }
      this.showoverlay = true
    },
    checkResult(depositTxnId){
      this.spinning = true
      this.spin()
      this.note = ""

      fetch(`https://circuits.guslots.net/${depositTxnId}`).then(resp =>{
        if(resp.ok){
          resp.json().then(json =>{
            console.log(`Response from circuits ${JSON.stringify(json)}`)
            if (json.win){
              fetch(`https://api.x.immutable.com/v1/assets/0xacb3c6a43d15b907e8433077b6d38ae40936fe2c/${json.txn.card}`)
                  .then(response => response.json())
                  .then(data => {
                    // Display winning card
                    this.overlaytitle = "Congratulations!"
                    // TODO show card image
                    this.overlaymessage = `
<p>You won a Genesis card! It was...</p>
<img src="${data['image_url']}&png=true">
<p><small>Sent via transaction #${json.txn.txn} - it will be with you very soon!</small></p>`
                    this.showoverlay = true
                    this.spinning = false
                  });
            } else {
              // Display losing message
              this.nowin()
            }
          })
        } else {
          this.nowin()
          console.log(`circuits status response ${resp.status}`)
        }
      })
    },
    async buy(){
      if(!this.link){
        this.link = new Link('https://link.x.immutable.com');
      }
      if (!this.address){
        const {address} = await this.link.setup({});
        this.address = address
        localStorage.setItem('WALLET_ADDRESS', address);
      }

      let transfer
      try {
        transfer = await this.link.transfer([
          {
            amount: parseFloat(this.gods).toFixed(1),
            symbol: 'GODS',
            type: ERC20TokenType.ERC20,
            tokenAddress: '0xccc8cb5229b0ac8069c51fd58367fd1e622afd97', // $GODS address
            toAddress: '0xB1DB53656AFC6D191aD841A17dcE47dd5cdDeDb8', // index 14?
          }])
        this.checkResult(transfer.result[0].txId)
      } catch (e) {
        this.nowin()
        this.overlaytitle = "Error"
        this.overlaymessage = "Payment failed. You have not been charged.<br>If you still want to play, please try again."
        this.showoverlay = true
        console.log(e)
      }
    }
  },
  async mounted(){
    this.link = new Link('https://link.x.immutable.com');
    this.address = localStorage.getItem('WALLET_ADDRESS');

    // Get list of available prizes
    const client = await ImmutableXClient.build({publicApiUrl: 'https://api.x.immutable.com/v1'});
    let assetRequest
    let assetCursor

    do {
      try{
        assetRequest = await client.getAssets({
          user: '0x7e528a48707271a32e604249560f453db614b174',
          status: 'imx',
          collection: '0xacb3c6a43d15b907e8433077b6d38ae40936fe2c',
          cursor: assetCursor
        })
      } catch (err) {
        console.error(err)
      }
      this.prizeArray = this.prizeArray.concat(assetRequest.result)
      assetCursor = assetRequest.cursor
    } while (assetCursor)

    if (this.prizeArray.length === 0){
      // Show message closed no prizes remaining
      this.overlaytitle = "We're closed!"
      this.overlaymessage = "We have no prizes left!<br>Check back soon for more."
    } else {
      let prizeKey
      let keys
      for(let i=0; i < this.prizeArray.length; i++){
        prizeKey = `${prizerank[this.prizeArray[i].metadata.quality]}${this.prizeArray[i].metadata.quality} ${this.prizeArray[i].metadata.name}`
        keys = Object.keys(this.prizes)
        if(keys.indexOf(prizeKey) === -1){
          this.prizes[prizeKey] = 1
        } else {
          this.prizes[prizeKey]++
        }
      }
      // Sort by quality (first char in key)
      const ordered = Object.keys(this.prizes).sort().reduce(
          (obj, key) => {
            obj[key] = this.prizes[key];
            return obj;
          },
          {}
      );
      this.prizes = ordered
      this.overlaytitle = ""
      this.overlaymessage = ""
      this.overlaybutton = true
      this.showoverlay = false
    }
  }
}
</script>

<style>
@import url('https://images.godsunchained.com/fonts/css/gu-fonts.css');
@import url('https://fonts.googleapis.com/css2?family=Glory&display=swap');

html, body{
  text-align: center;
  margin: 0;
  background: #181818;
  width: 100vw;
  height: 100vh;
  color: #fff;
  font-family: 'Glory', sans-serif;
  font-size: 120%;
  background: url('/teal-agrodor.jpg');
  background-repeat: no-repeat;
  background-size: cover;
  background-attachment: fixed;
  overflow-x: hidden;
}

h1, h2{
  font-family: 'Unchained', serif;
  display: block;
  background: linear-gradient( to bottom, #FFF2D8 0%, #C6A052 100% );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-transform: uppercase;
}

h2{
  padding: 0;
  margin: 0 0 12px;
}

.slotholder{
  padding: 12px;
  margin: 0 auto;
  width: 340px;
  position: relative;
}

#slot {
  display: block;
  margin: 0;
  padding: 0;
  width: 100%;
  z-index: 10;
  position: absolute;
  top:0;
}

#spinner{
  z-index: 9;
  position: absolute;
  top:0;
  left: 20px;
  background-size: cover;
  background: url("/scroll.jpg") repeat;
  width: 180px;
  height: 200px;
  margin: 60px;
  padding-top: 12px;
}

.container{
  padding-top: 12px;
  width: 100%;
}

.below{
  margin-top: 431px;
}

button{
  display: block;
  width: 380px;
  background: linear-gradient( to bottom, #FFF2D8 0%, #C6A052 100% );
  cursor: pointer;
  color: #000;
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  margin: 0 auto;
  font-family: 'Unchained', serif;
  font-size: 18pt;
  transition: background .4s ease-in-out;
}
button:hover{
  background: linear-gradient( to bottom, #C6A052 0%, #a90000 100% );
}

input[type="range"]{
  -webkit-appearance:none;
  width:300px;
  height:20px;
  margin:10px 50px;
  background-size:150px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 15%, #a90000 50%, rgba(0,0,0,0) 85%, rgba(0,0,0,0) 100%) no-repeat center;
  overflow:hidden;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb{
  -webkit-appearance:none;
  width:20px;
  height:20px;
  background: radial-gradient(#fd0, #C6A052);
  position:relative;
  z-index:3;
  box-shadow:0 0 5px 0 #000;
  border-radius: 20px;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb:after{
  content:" ";
  width:160px;
  height:10px;
  position:absolute;
  z-index:1;
  right:20px;
  top:5px;
  /*background: #ff5b32;*/
}

.overlay{
  position: fixed;
  height: 100vh;
  width: 100vw;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(5px);
  z-index: 10000;
}

.overlay-container{
  width: 400px;
  max-height: 90vh;
  border-radius: 10px;
  margin: 128px auto;
  padding: 24px;
  border: #C6A052;
  background: #006D7EFF;
}
.overlay-content{
  max-height: 400px;
  overflow-y: scroll;
}
a{
  color: #9f63b6;
  text-decoration: none;
  font-weight: bold;
}

a:hover{
  color: #006D7EFF;
}
.color4{
  color: #960000;
}
.color1{
  color: #6dfffb;
}
.color2{
  color: #ffcb00;
}
.color3{
  color: #cb65ff;
}

</style>
