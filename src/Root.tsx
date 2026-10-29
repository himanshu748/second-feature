import {useEffect,useRef,useState} from 'react';
import Landing from './Landing';
import App from './App';
const isWorkspace=()=>window.location.hash.startsWith('#/workspace');
export default function Root(){
 const [workspace,setWorkspace]=useState(isWorkspace);
 const [hasOpened,setHasOpened]=useState(isWorkspace);
 const previous=useRef(workspace);
 useEffect(()=>{
  const sync=()=>{const next=isWorkspace();setWorkspace(next);if(next)setHasOpened(true);};
  window.addEventListener('hashchange',sync);
  return()=>window.removeEventListener('hashchange',sync);
 },[]);
 useEffect(()=>{
  document.title=workspace?'Second Feature | Programming Desk':'Second Feature | Find your second film';
  if(previous.current!==workspace){
   window.scrollTo(0,0);
   const main=document.getElementById(workspace?'main':'landing-main');
   main?.setAttribute('tabindex','-1');main?.focus({preventScroll:true});
  }
  previous.current=workspace;
 },[workspace]);
 return <>{!workspace&&<Landing/>}{hasOpened&&<div hidden={!workspace}><App onHome={()=>{window.location.hash='/';}}/></div>}</>;
}
