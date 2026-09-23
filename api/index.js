import app from '../server/index.js';

export default function handler(req,res){
  const url=new URL(req.url,'http://localhost');
  const route=url.searchParams.get('_wb_route');
  if(route!==null){url.searchParams.delete('_wb_route');req.url='/api/'+route+(url.search||'');}
  return app(req,res);
}
