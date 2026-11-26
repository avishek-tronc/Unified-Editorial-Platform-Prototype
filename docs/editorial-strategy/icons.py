C={"GR":"#0F766E","SIC":"#334155","IA":"#B45309","TR":"#1D4ED8","RD":"#7C3AED","CW":"#0E7490","WC":"#BE185D","OI":"#15803D"}
S='stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"'
G={
"GR":f'<rect x="28" y="22" width="40" height="52" rx="5" {S}/><path d="M36 38 l5 5 l9 -10" {S}/><path d="M36 58 l5 5 l9 -10" {S}/><path d="M56 41 h6 M56 61 h6" {S}/>',
"SIC":f'<ellipse cx="48" cy="28" rx="22" ry="8" {S}/><path d="M26 28 v40 c0 5 10 8 22 8 s22 -3 22 -8 v-40" {S}/><path d="M26 48 c0 5 10 8 22 8 s22 -3 22 -8" {S}/>',
"IA":f'<path d="M48 18 l24 9 v18 c0 16 -11 27 -24 33 c-13 -6 -24 -17 -24 -33 v-18 z" {S}/><path d="M37 48 l8 8 l14 -15" {S}/>',
"TR":f'<path d="M22 66 h14 c10 0 12 -8 16 -18 s6 -18 16 -18 h6" {S}/><path d="M22 66 h52" {S}/><path d="M66 22 l8 8 l-8 8 M66 58 l8 8 l-8 8" {S}/>',
"RD":f'<circle cx="42" cy="38" r="9" {S}/><path d="M26 66 c2 -10 8 -15 16 -15 s14 5 16 15" {S}/><circle cx="64" cy="62" r="8" {S}/><path d="M70 68 l7 7" {S}/>',
"CW":f'<rect x="20" y="24" width="56" height="48" rx="5" {S}/><path d="M20 36 h56 M40 36 v36" {S}/><path d="M48 48 h20 M48 58 h14" {S}/>',
"WC":f'<circle cx="28" cy="32" r="7" {S}/><circle cx="68" cy="32" r="7" {S}/><circle cx="48" cy="66" r="7" {S}/><path d="M35 32 h26 M64 38 l-12 22 M32 38 l12 22" {S}/>',
"OI":f'<path d="M22 74 h52" {S}/><path d="M30 74 v-16 M44 74 v-28 M58 74 v-20 M72 74 v-38" {S}/><path d="M28 44 l14 -12 l12 8 l18 -16" {S}/>',
}
for k in C:
    open(f'icons/{k}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="{C[k]}"/>{G[k]}</svg>')
