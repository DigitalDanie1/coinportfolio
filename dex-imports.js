/* Verified user-supplied pools. Import once; deletions remain deleted. */
const DEX_IMPORT_VERSION="user-dex-links-20260918-v1";
const DEX_IMPORTS=[
  {
    "id": "dex-robinhood-orbio",
    "name": "Orbio.so",
    "ticker": "ORBIO",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0xa95b1fbdccb15d2b07509b980f63adab8a94303b1781f5ebc53b72942d12ddc1",
    "dex": {
      "chain": "robinhood",
      "pair": "0xa95b1fbdccb15d2b07509b980f63adab8a94303b1781f5ebc53b72942d12ddc1",
      "token": "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3"
    }
  },
  {
    "id": "dex-solana-purr",
    "name": "Hypurr",
    "ticker": "PURR",
    "cat": "fomo",
    "note": "solana",
    "gecko": "dex:solana:Ad7pbBvVRNofo96WR6eHwmU2o4naZ6Lao1J98hW8a1TQ",
    "dex": {
      "chain": "solana",
      "pair": "Ad7pbBvVRNofo96WR6eHwmU2o4naZ6Lao1J98hW8a1TQ",
      "token": "8RNUw4N655VSrZKuhGdywhbSMDTrheguFPfxbpE2NZHQ"
    }
  },
  {
    "id": "purr-hev",
    "name": "Purr",
    "ticker": "PURR",
    "cat": "fomo",
    "note": "hyperevm",
    "gecko": "dex:hyperevm:0x54175D986b00292B669B9AefA0a466d12B8215D6",
    "dex": {
      "chain": "hyperevm",
      "pair": "0x54175D986b00292B669B9AefA0a466d12B8215D6",
      "token": "0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E"
    }
  },
  {
    "id": "dex-robinhood-frong",
    "name": "frong",
    "ticker": "FRONG",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0xacea8920877840033f0275c37f9b61550b5326917e948bcf8339714d96f9521a",
    "dex": {
      "chain": "robinhood",
      "pair": "0xacea8920877840033f0275c37f9b61550b5326917e948bcf8339714d96f9521a",
      "token": "0x6245e67affA44a23077f0Ea7f981a8DC743a0c47"
    }
  },
  {
    "id": "dex-robinhood-wallet",
    "name": "Robinhood Wallet",
    "ticker": "WALLET",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x9501A20Bedb8beA0798FE5D4c411f5e270965D49",
    "dex": {
      "chain": "robinhood",
      "pair": "0x9501A20Bedb8beA0798FE5D4c411f5e270965D49",
      "token": "0x0339f5459FC690aC85F1782e15782A151b4A9E1b"
    }
  },
  {
    "id": "dex-robinhood-net",
    "name": "NetNet",
    "ticker": "NET",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x59F95461E68e0c77605299791E1449f175165B54",
    "dex": {
      "chain": "robinhood",
      "pair": "0x59F95461E68e0c77605299791E1449f175165B54",
      "token": "0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf"
    }
  },
  {
    "id": "dex-robinhood-note",
    "name": "Note Systems",
    "ticker": "NOTE",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x378b102395b2c4f9a9ebe650b5b501d0810c60126f886107d8812ca7ff7f9f91",
    "dex": {
      "chain": "robinhood",
      "pair": "0x378b102395b2c4f9a9ebe650b5b501d0810c60126f886107d8812ca7ff7f9f91",
      "token": "0xc4f730335Fb9e439ca5552f7b52B8E638c4245B0"
    }
  },
  {
    "id": "dex-robinhood-delta",
    "name": "Delta",
    "ticker": "DELTA",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0xD64FbdA67E1015dF43Fa5e49F02cA844729E5F94",
    "dex": {
      "chain": "robinhood",
      "pair": "0xD64FbdA67E1015dF43Fa5e49F02cA844729E5F94",
      "token": "0xe8ffd7e24187F72afB08d75B1bb13088A989a791"
    }
  },
  {
    "id": "dex-robinhood-juggernaut",
    "name": "The Juggernaut",
    "ticker": "JUGGERNAUT",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x588b0785f50063260003B7790C42f1eF74902746",
    "dex": {
      "chain": "robinhood",
      "pair": "0x588b0785f50063260003B7790C42f1eF74902746",
      "token": "0xD7321801CAae694090694Ff55A9323139F043B88"
    }
  },
  {
    "id": "prlg",
    "name": "Prologue",
    "ticker": "PROLOGUE",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x8651e656738064177752a395dbde2b2a9e3fc469edc2a9212e6060c0990bb7eb",
    "dex": {
      "chain": "robinhood",
      "pair": "0x8651e656738064177752a395dbde2b2a9e3fc469edc2a9212e6060c0990bb7eb",
      "token": "0xb9972CA7188e511174947E3936a5315ac7073277"
    }
  },
  {
    "id": "dex-robinhood-robin",
    "name": "Robin the Frog",
    "ticker": "ROBIN",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0x5eac4195930d5ff8b7a34a347f2bde951c42eb730d6e26075bea3dd7c66feb40",
    "dex": {
      "chain": "robinhood",
      "pair": "0x5eac4195930d5ff8b7a34a347f2bde951c42eb730d6e26075bea3dd7c66feb40",
      "token": "0x11B70d0243baf75E85CE03201A92b5B7C33BEB59"
    }
  },
  {
    "id": "dex-robinhood-moo",
    "name": "Memory cow Moo",
    "ticker": "MOO",
    "cat": "fomo",
    "note": "robinhood",
    "gecko": "dex:robinhood:0xc3cc877a8a7d28efdb5dbec9ae71724652431e6411aa1a9fc8928028da554aa1",
    "dex": {
      "chain": "robinhood",
      "pair": "0xc3cc877a8a7d28efdb5dbec9ae71724652431e6411aa1a9fc8928028da554aa1",
      "token": "0xD9dB30BB0D2b8d2eae3826A1372117E058791e18"
    }
  }
];
function importDexLinks(){
  if(appliedImports.includes(DEX_IMPORT_VERSION))return;
  for(const item of DEX_IMPORTS){
    const existing=coins.find(c=>c.dex?.chain===item.dex.chain&&c.dex?.pair===item.dex.pair)||coins.find(c=>c.id===item.id);
    if(existing){
      // Preserve stable IDs, categories, balances and every journal field.
      const category=existing.cat;
      Object.assign(existing,item,{id:existing.id,cat:category,providerId:null});
      delete marketByCoin[existing.id];
      delete newsByAsset['spot:'+existing.id];
    }else coins.push(JSON.parse(JSON.stringify(item)));
  }
  appliedImports.push(DEX_IMPORT_VERSION);
  save();saveAutomaticCache();
}
