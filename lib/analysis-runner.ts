import {analyzeDraft,type DraftAnalysis,type ReadyPick} from './optimizer';

type WorkerLike=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;
type Input={players:Parameters<typeof analyzeDraft>[0];drafted:Parameters<typeof analyzeDraft>[1];settings:Parameters<typeof analyzeDraft>[2];teams:Parameters<typeof analyzeDraft>[3];context:Parameters<typeof analyzeDraft>[4]};

// Inline workers avoid an authenticated HTTP request for a second script.
// If the browser disallows workers, use the already-bundled engine, not another
// network import. No fallback ever changes the model or the saved draft.
export function startAnalysis(input:Input,createWorker:()=>WorkerLike,onResult:(value:DraftAnalysis)=>void,onError:(message:string)=>void,onPickReady?:(pick:ReadyPick)=>void){
 let cancelled=false,fallingBack=false,worker:WorkerLike|undefined;
 let fallbackTimer:ReturnType<typeof setTimeout>|undefined;
 let watchdog:ReturnType<typeof setTimeout>|undefined;
 const finish=(value:DraftAnalysis)=>{if(!cancelled)onResult(value);};
 const fallback=()=>{
  if(cancelled||fallingBack)return;
  fallingBack=true;clearTimeout(watchdog);worker?.terminate();
  fallbackTimer=setTimeout(()=>{if(cancelled)return;try{finish(analyzeDraft(input.players,input.drafted,input.settings,input.teams,input.context));}catch(error){if(!cancelled)onError(`Draft analysis failed: ${error instanceof Error?error.message:'unknown error'}. Your saved draft is unchanged.`);}},0);
 };
 try{
  worker=createWorker();
  worker.onmessage=event=>{
   if(cancelled||fallingBack)return;
   if(event.data?.pickReady){onPickReady?.(event.data.pickReady);return;}
   if(!event.data?.analysis){fallback();return;}
   clearTimeout(watchdog);worker?.terminate();finish(event.data.analysis);
  };
  worker.onerror=event=>{event.preventDefault?.();fallback();};
  worker.onmessageerror=fallback;
  watchdog=setTimeout(fallback,30000);
  worker.postMessage(input);
 }catch{fallback();}
 return ()=>{cancelled=true;clearTimeout(watchdog);clearTimeout(fallbackTimer);worker?.terminate();};
}
