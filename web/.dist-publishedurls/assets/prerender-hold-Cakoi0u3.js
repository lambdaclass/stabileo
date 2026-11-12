function o(r){const e=globalThis;e.__prerenderHolds=(e.__prerenderHolds??0)+1;const n=()=>{setTimeout(()=>{e.__prerenderHolds=(e.__prerenderHolds??1)-1},0)};return r.then(n,n),r}export{o as h};
