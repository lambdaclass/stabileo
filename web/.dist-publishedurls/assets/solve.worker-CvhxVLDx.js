self.onmessage=async a=>{try{const e=await import(a.data);await e.default(),self.postMessage({layout:JSON.parse(e.recompute())})}catch{self.postMessage({error:!0})}};
