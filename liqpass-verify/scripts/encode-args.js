const Web3 = require('web3');

// 构造参数
const constructorArgs = [
  "0x833589fCd6EDB6E08F4c7C32D4F71B54bDa02913", // USDC 地址
  "0x9aEA8865A46A37a9dB738fD0F1eE2bED49D143F1"  // Treasury 地址
];

// 使用web3编码构造参数
const web3 = new Web3();
const encodedArgs = web3.eth.abi.encodeParameters(['address', 'address'], constructorArgs).slice(2);

console.log('构造参数编码:', encodedArgs);