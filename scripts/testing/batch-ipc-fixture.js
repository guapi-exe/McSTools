// Browser UI fixture only. ZIP parsing, encoding and atomic saves are tested in Rust, not simulated here.
export function installBatchFixture() {
  const base=window.__TAURI_INTERNALS__.invoke;
  const state=window.__BATCH_FIXTURE__={calls:[],conversions:[],saves:[],releases:[],session:null,next:1,
    delay:30,pickDelay:0,saveDelay:0,cancelDelay:0,saveMode:'success',failCreate:false,
    pickerItems:[{name:'first.litematic'},{name:'broken.schem',failOnce:true},{name:'last.nbt'}]};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const session=id=>{if(!state.session||state.session.id!==id)throw new Error('stale batch session');return state.session};
  const snapshot=s=>({id:s.id,items:clone(s.items),inputBytes:s.items.reduce((sum,item)=>sum+item.size,0),outputBytes:s.items.reduce((sum,item)=>sum+item.outputBytes,0),busy:s.job?.kind??null,stopping:s.job?.cancel??false,options:clone(s.options)});
  const row=source=>({id:state.next++,name:source.name,origin:source.archiveName?'zip':'file',archiveName:source.archiveName??null,size:source.size??128,status:'queued',error:null,outputName:null,outputBytes:0,sourceDataVersion:null,outputDataVersion:null,warnings:[],failOnce:source.failOnce??false});
  const begin=(id,kind)=>{const s=session(id);if(s.job)throw new Error('another batch operation is running');s.job={kind,cancel:false};return {s,job:s.job}};
  const commands={
    create_blueprint_batch:()=>{if(state.failCreate){state.failCreate=false;throw new Error('simulated initialization failure')}
      if(state.session)throw new Error('another batch session is open');state.session={id:state.next++,items:[],options:null,job:null};return snapshot(state.session)},
    get_blueprint_batch:args=>snapshot(session(args.batchId)),
    cancel_blueprint_batch:async args=>{await wait(state.cancelDelay);const s=session(args.batchId);if(s.job)s.job.cancel=true},
    release_blueprint_batch:args=>{state.releases.push(args.batchId);if(state.session?.id===args.batchId){if(state.session.job)state.session.job.cancel=true;state.session=null}},
    pick_blueprint_batch_files:async args=>{const {s,job}=begin(args.batchId,'import');await wait(state.pickDelay);if(!job.cancel)s.items.push(...state.pickerItems.map(row));s.job=null;return snapshot(s)},
    add_blueprint_batch_file:async args=>{
      if(!(args instanceof Uint8Array))throw new Error('batch input requires binary IPC');
      const length=new DataView(args.buffer,args.byteOffset,args.byteLength).getUint32(0,true);
      const meta=JSON.parse(new TextDecoder().decode(args.slice(4,4+length))),{s,job}=begin(meta.batch_id,'import');
      state.lastPayload={metadata:meta,length:args.byteLength};await wait(state.pickDelay);
      if(!job.cancel)s.items.push(row({name:meta.name,size:args.byteLength-4-length}));s.job=null;return snapshot(s);
    },
    convert_blueprint_batch_item:async args=>{
      const {s,job}=begin(args.batchId,'convert'),item=s.items.find(item=>item.id===args.itemId);
      if(!item){s.job=null;throw new Error('batch item not found')}
      state.conversions.push(clone(args));item.status='processing';item.error=null;s.options=clone(args.options);
      await wait(state.delay);
      if(job.cancel){item.status='queued';s.job=null;return clone(item)}
      let error=item.failOnce?'simulated invalid NBT':null;item.failOnce=false;
      if(args.options.format===6&&!args.options.targetDataVersion)error='MCEdit requires an explicit target';
      if(args.options.format===5&&(args.options.targetDataVersion||args.options.overrides.length))error='Bedrock output does not accept Java version conversion';
      if(error){item.status='error';item.error=error}else{
        const ext={1:'nbt',2:'litematic',3:'schem',4:'json',5:'mcstructure',6:'schematic'}[args.options.format];
        item.status='success';item.outputName=item.name.replace(/\.[^.]+$/,'')+'-converted.'+ext;item.outputBytes=256;
        item.sourceDataVersion=3578;item.outputDataVersion=args.options.format===5?null:args.options.targetDataVersion??3578;
        item.warnings=args.options.format===5?['Fixture: Bedrock separate water layer']:[];
      }
      s.job=null;return clone(item);
    },
    remove_blueprint_batch_items:args=>{const s=session(args.batchId);if(s.job)throw new Error('another batch operation is running');s.items=s.items.filter(item=>!args.itemIds.includes(item.id));if(!s.items.some(item=>item.status==='success'))s.options=null;return snapshot(s)},
    save_blueprint_batch_results:async args=>{
      const {s,job}=begin(args.batchId,'save');state.saves.push(clone(args));await wait(state.saveDelay);s.job=null;
      if(job.cancel||state.saveMode==='cancel')return {canceled:true,filename:null,bytes:0};
      if(state.saveMode==='exists')throw new Error('copy destination already exists; choose a new filename');
      return {canceled:false,filename:args.zip?'mcstools-batch.zip':s.items.find(item=>item.id===args.itemIds[0]).outputName,bytes:args.itemIds.length*256};
    }
  };
  window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
    if(!commands[command])return base(command,args);
    state.calls.push({command,args:args instanceof Uint8Array?{rawBytes:args.byteLength}:clone(args)});
    return commands[command](args);
  };
  return true;
}
