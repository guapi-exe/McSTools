// Browser-only protocol fixture for Playwright CLI. Real palette, worker, Vue and canvas code; no database or filesystem writes.
(() => {
  const state = window.__TOOLBOX_FIXTURE__ = {calls: [], sources: {}, released: [], saves: [], stageDelay: 0, failStage: false, next: 1};
  const store = {autoUpdate: false, locale: 'zh-CN'};
  const versions = [{id:5,name:'1.7.10'},{id:1343,name:'1.12.2'},{id:3465,name:'1.20.1'},{id:3955,name:'1.21.1'}];
  const formats = [{id:1,name:'香草结构',extension:'nbt',subtypes:[{id:-1,name:'默认',versions:versions.slice(2)}]},
    {id:2,name:'投影结构',extension:'litematic',subtypes:[{id:6,name:'投影格式 6',versions:versions.slice(2)}]},
    {id:3,name:'创世神',extension:'schem',subtypes:[{id:0,name:'Sponge v2',versions:versions.slice(1)},{id:1,name:'Sponge v3',versions:versions.slice(2)}]},
    {id:4,name:'建筑小帮手',extension:'json',subtypes:[{id:0,name:'BG 1.20+',versions:versions.slice(2)}]},
    {id:5,name:'MC BE',extension:'mcstructure',subtypes:[{id:-1,name:'默认',versions:[]}]},
    {id:6,name:'创世神旧版',extension:'schematic',subtypes:[{id:-1,name:'MCEdit',versions:versions.slice(0,2)}]}];
  window.__TAURI_INTERNALS__ = {metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},convertFileSrc: path => path,
    transformCallback: () => 1, unregisterCallback: () => {}, invoke: async (command, args={}) => {
      state.calls.push(command);
      if (command === 'plugin:store|load') return 1;
      if (command === 'plugin:store|get') return [store[args.key], args.key in store];
      if (command === 'plugin:store|set') { store[args.key]=args.value; return; }
      if (command.startsWith('plugin:store|')) return;
      if (command === 'get_map_arts') return (await fetch('/src-tauri/data/blocks_art.json')).json();
      if (command === 'get_user_data') return {id:1,nickname:'Isolated test',classification:'[]',schematics:0,cloud:0};
      if (command === 'get_user_classification') return '[]';
      if (command.includes('je_blocks')) return [];
      if (command === 'get_blueprint_export_formats') return formats;
      if (command === 'stage_generated_blueprint') {
        if (!(args instanceof Uint8Array)) throw new Error('expected raw binary IPC');
        const length=new DataView(args.buffer,args.byteOffset,args.byteLength).getUint32(0,true);
        const metadata=JSON.parse(new TextDecoder().decode(args.slice(4,4+length)));
        const view=new DataView(args.buffer,args.byteOffset+4+length,args.byteLength-4-length);
        let count=0; for(let i=0;i<view.byteLength;i+=2) if(view.getUint16(i,true)) count++;
        if(state.stageDelay) await new Promise(resolve=>setTimeout(resolve,state.stageDelay));
        if(state.failStage) { state.failStage=false; throw new Error('simulated staging failure'); }
        const id=state.next++; state.sources[id]={...metadata,byteLength:args.byteLength,count}; return id;
      }
      if (command === 'release_generated_blueprint') { delete state.sources[args.generationId]; state.released.push(args.generationId); return; }
      if (command === 'plan_blueprint_export') {
        const source=state.sources[args.source.generation_id]; if(!source) throw new Error('stale generated source');
        if(args.options.format===6 && !args.options.targetDataVersion) throw new Error('MCEdit requires an explicit target');
        return {sourceDataVersion:3955,outputDataVersion:args.options.targetDataVersion??3955,size:{width:source.size[0],height:source.size[1],length:source.size[2]},compatibility:null,warnings:[],canSaveCache:false,cached:null};
      }
      if (command === 'save_blueprint_export') {
        state.saves.push(JSON.parse(JSON.stringify(args)));
        return {canceled:false,filename:'fixture.'+formats.find(f=>f.id===args.options.format).extension,bytes:128,destination:args.destination};
      }
      if (command.startsWith('plugin:app|')) return '1.3.0';
      if (command === 'close_splashscreen') return;
      return [];
    }};
})();
