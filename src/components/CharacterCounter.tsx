interface Props { count:number; max?:number; }
export function CharacterCounter({count,max}:Props){return <span className={`character-counter ${max&&count>=max?"at-limit":""}`}>{count.toLocaleString()}{max?` / ${max.toLocaleString()}`:""}</span>}
