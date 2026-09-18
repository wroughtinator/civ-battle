// Small, shared visual rules matching the authoritative terrain mechanics.
export const terrainIcons=['sail','wheat','tree','sand','mountain','snow'];
export const inForestCover=(world,u)=>world[u.tile]?.terrain===2&&!(u.kind>=6&&u.kind<=9);
export const terrainSlows=(terrain,kind)=>!(kind>=6&&kind<=9)&&(terrain===4||terrain===2&&kind!==5);
export const rate=value=>Number(value.toFixed(2)).toString();
export const incomeBenefit=(icon,amount)=>`<span class="upgrade-benefit">${icon('coin')}+${rate(amount/5)}<span class="upgrade-per">/${icon('clock')}1</span></span>`;
