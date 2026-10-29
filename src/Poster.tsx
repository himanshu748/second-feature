import {useId} from 'react';
import type {Film} from './lib/types';
export default function Poster({film,compact=false}:{film:Film;compact?:boolean}) {
 const id=useId().replace(/:/g,''); const [bg,light,accent]=film.palette;
 return <div className={`poster-art ${compact?'compact':''}`} style={{background:bg,color:light}} aria-label={`Original typographic artwork for ${film.title}`}>
 <svg viewBox="0 0 400 550" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
 <defs><pattern id={`lines${id}`} width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0V4" stroke={light} strokeOpacity=".08" strokeWidth="1"/></pattern><linearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bg} stopOpacity="0"/><stop offset="1" stopColor={bg}/></linearGradient><clipPath id={`clip${id}`}><rect x="30" y="55" width="340" height="365" rx="160"/></clipPath></defs>
 <rect width="400" height="550" fill={bg}/>
 {film.motif==='stairs'&&<g><circle cx="295" cy="174" r="112" fill={accent}/><path d="M0 385H74V339H131V293H188V247H245V201H302V155H400V550H0Z" fill={light} fillOpacity=".72"/><path d="M40 550V425H110V378H167V331H224V285H281V239H338V193H400V550" fill={bg}/><path d="M84 330L310 150M40 388L335 150" stroke={light} strokeWidth="2" opacity=".4"/></g>}
 {film.motif==='city'&&<g><circle cx="275" cy="178" r="108" fill={accent}/>{[0,1,2,3,4,5,6,7].map(n=><g key={n}><rect x={n*57-10} y={170+(n%3)*35} width="44" height="280" fill={n%2?light:bg} opacity={n%2?.5:1}/>{[0,1,2,3,4].map(j=><path key={j} d={`M${n*57} ${205+j*32+(n%3)*35}h23`} stroke={n%2?bg:light} strokeWidth="5" opacity=".55"/>)}</g>)}<path d="M0 405L400 307V335L0 433Z" fill={accent} opacity=".7"/></g>}
 {film.motif==='sun'&&<g><circle cx="200" cy="212" r="142" fill={light}/><circle cx="200" cy="212" r="104" fill={accent}/><path d="M0 345Q100 255 210 342T420 322V550H0Z" fill={bg}/>{[0,1,2,3,4].map(n=><path key={n} d={`M0 ${350+n*20} Q100 ${290+n*20} 210 ${350+n*20} T420 ${330+n*20}`} stroke={light} strokeWidth="1.5" fill="none" opacity=".45"/>)}</g>}
 {film.motif==='moon'&&<g><circle cx="200" cy="220" r="139" fill={light}/><circle cx="247" cy="175" r="121" fill={bg}/><path d="M0 428Q100 330 198 419T400 375V550H0Z" fill={accent}/><path d="M0 457Q145 345 280 450T400 410" stroke={light} strokeWidth="1" fill="none"/></g>}
 {film.motif==='road'&&<g><circle cx="285" cy="170" r="98" fill={accent}/><path d="M0 270L110 222L192 279L300 235L400 275V550H0Z" fill={light} opacity=".55"/><path d="M167 300H203L350 550H5Z" fill={bg}/><path d="M186 315L173 350M167 369L141 431M132 450L97 530" stroke={accent} strokeWidth="3"/></g>}
 {film.motif==='waves'&&<g><circle cx="255" cy="185" r="115" fill={accent}/>{[0,1,2,3,4,5].map(n=><path key={n} d={`M-40 ${255+n*27}Q50 ${180+n*27} 150 ${260+n*27}T350 ${260+n*27}T500 ${260+n*27}`} fill="none" stroke={light} strokeWidth={n%2?2:18} opacity={n%2?.6:.25}/>)}</g>}
 <rect width="400" height="550" fill={`url(#lines${id})`}/><rect y="320" width="400" height="230" fill={`url(#fade${id})`}/>
 </svg>
 <div className="poster-top"><span>A FILM BY<br/>{film.director.toUpperCase()}</span><span>{film.year}</span></div>
 <div className="poster-title"><span>{film.title}</span><small>{film.country.toUpperCase()} / {film.minutes} MIN</small></div>
 </div>
}
