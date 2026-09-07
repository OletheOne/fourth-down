export class SiteRequestError extends Error {
  constructor(message:string,public needsSignIn=false,public status?:number){super(message);this.name='SiteRequestError';}
}

// A private Sites session can expire while an already-loaded page stays open.
// Never parse the dispatcher's sign-in HTML as application JSON.
export async function requestSiteJson<T>(url:string,fetcher:typeof fetch=fetch):Promise<T>{
  let response:Response;
  try{response=await fetcher(url,{credentials:'include',headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});}
  catch{throw new SiteRequestError('The refresh could not reach Fourth Down. Check your connection and try again. Your saved draft is unchanged.');}
  const signIn=response.status===401||response.status===403||(response.redirected&&/\/signin-with-chatgpt|\/callback|\/auth\//i.test(response.url));
  if(signIn)throw new SiteRequestError('Your Fourth Down sign-in needs to be renewed. Reconnect below, then refresh FantasyPros. Your saved draft is unchanged.',true,response.status);
  if(!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type')??'')){
    throw new SiteRequestError(`Fourth Down received a non-JSON response (HTTP ${response.status}). Reload the app and try again. Your saved draft is unchanged.`,false,response.status);
  }
  let data:unknown;
  try{data=await response.json();}catch{throw new SiteRequestError('The refresh returned incomplete data. Try again; your saved draft is unchanged.',false,response.status);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new SiteRequestError('The refresh returned an invalid dataset. Your saved draft is unchanged.',false,response.status);
  const payload=data as {error?:unknown};
  if(!response.ok||typeof payload.error==='string')throw new SiteRequestError(typeof payload.error==='string'?payload.error:`Refresh failed (HTTP ${response.status}). Your saved draft is unchanged.`,false,response.status);
  return data as T;
}
