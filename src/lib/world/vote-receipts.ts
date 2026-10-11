import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
function canonical(value: unknown): string {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export async function reserveVoteReceipt(directory: string, actor: string, key: string, input: unknown) {
  if(!/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw new Error('Invalid Idempotency-Key');
  const id=crypto.createHash('sha256').update(actor+'\0'+key).digest('hex');
  const fingerprint=crypto.createHash('sha256').update(canonical(input)).digest('hex');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,id+'.json');
  let handle;
  try{handle=await fs.open(file,'wx',0o600);}catch(error:any){
    if(error.code!=='EEXIST')throw error;
    const receipt=JSON.parse(await fs.readFile(file,'utf8'));
    if(receipt.fingerprint!==fingerprint)throw new Error('idempotency_conflict');
    return {id,file,fingerprint,created:false,vote:receipt.vote};
  }
  try{await handle.writeFile(JSON.stringify({fingerprint,state:'pending'}));await handle.sync();}finally{await handle.close();}
  return {id,file,fingerprint,created:true,vote:undefined};
}
export async function completeVoteReceipt(receipt:{file:string;fingerprint:string},vote:unknown){
 const temporary=receipt.file+'.'+crypto.randomUUID()+'.tmp';
 await fs.writeFile(temporary,JSON.stringify({fingerprint:receipt.fingerprint,state:'completed',vote}),{mode:0o600});
 await fs.rename(temporary,receipt.file);
}
