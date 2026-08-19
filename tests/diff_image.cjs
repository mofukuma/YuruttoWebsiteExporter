// 見本と書き出しを左右に並べ、その差を強めた絵を一枚へまとめる。
const fs=require('fs'),zlib=require('zlib');
const {decode}=require('./png.cjs');
function crc(buf){let c=~0;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(kind,body){const h=Buffer.alloc(4);h.writeUInt32BE(body.length,0);
 const kb=Buffer.from(kind,'ascii');const t=Buffer.alloc(4);t.writeUInt32BE(crc(Buffer.concat([kb,body])),0);
 return Buffer.concat([h,kb,body,t]);}
function encode(w,h,px){const raw=Buffer.alloc(h*(1+w*3));
 for(let y=0;y<h;y++){raw[y*(1+w*3)]=0;for(let x=0;x<w;x++){const s=(y*w+x)*4,d=y*(1+w*3)+1+x*3;
  raw[d]=px[s];raw[d+1]=px[s+1];raw[d+2]=px[s+2];}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const [,,gPath,wPath,out,gain=12]=process.argv;
const g=decode(fs.readFileSync(gPath)),b=decode(fs.readFileSync(wPath));
const W=g.width*3+16, H=g.height;
const px=Buffer.alloc(W*H*4,0);
for(let y=0;y<H;y++)for(let x=0;x<g.width;x++){
  const s=(y*g.width+x)*4;
  for(const [ox,src] of [[0,g],[g.width+8,b]]){const d=(y*W+x+ox)*4;
    px[d]=src.pixels[s];px[d+1]=src.pixels[s+1];px[d+2]=src.pixels[s+2];px[d+3]=255;}
  // 差は見えるように強めて、赤で示す。
  const diff=Math.min(255,Math.max(Math.abs(g.pixels[s]-b.pixels[s]),Math.abs(g.pixels[s+1]-b.pixels[s+1]),Math.abs(g.pixels[s+2]-b.pixels[s+2]))*gain);
  const d2=(y*W+x+g.width*2+16)*4;
  px[d2]=diff;px[d2+1]=diff>>2;px[d2+2]=diff>>2;px[d2+3]=255;}
fs.writeFileSync(out,encode(W,H,px));
console.log(out);
