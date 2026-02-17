const COLOR_MAP = {
  brown:'#8B4513', lightblue:'#87CEEB', pink:'#FF69B4', orange:'#FF8C00',
  red:'#FF0000', yellow:'#FFD700', green:'#228B22', darkblue:'#00008B',
  railroad:'#444', utility:'#777'
};
const CELL_ICONS = {
  start:'🏁', jail:'🔒', parking:'🅿️', gotojail:'👮',
  chance:'❓', chest:'💰', tax:'💸', railroad:'🚂', utility:'💡'
};

function createBoard(boardData){
  const el = document.getElementById('board');
  el.innerHTML = '';

  const S = 880;       // board size
  const C = 106;       // corner size
  const W = 68;        // cell width
  const positions = [];

  // bottom row 0..10 right->left
  positions[0] = {x:S-C, y:S-C, w:C, h:C, side:'corner'};
  for(let i=1;i<=9;i++) positions[i] = {x:S-C-i*W, y:S-C, w:W, h:C, side:'bottom'};
  positions[10] = {x:0, y:S-C, w:C, h:C, side:'corner'};

  // left col 11..19 bottom->top
  for(let i=1;i<=9;i++) positions[10+i] = {x:0, y:S-C-i*W, w:C, h:W, side:'left'};
  positions[20] = {x:0, y:0, w:C, h:C, side:'corner'};

  // top row 21..29 left->right
  for(let i=1;i<=9;i++) positions[20+i] = {x:C+(i-1)*W, y:0, w:W, h:C, side:'top'};
  positions[30] = {x:S-C, y:0, w:C, h:C, side:'corner'};

  // right col 31..39 top->bottom
  for(let i=1;i<=9;i++) positions[30+i] = {x:S-C, y:C+(i-1)*W, w:C, h:W, side:'right'};

  boardData.forEach((cell,i)=>{
    const p = positions[i]; if(!p) return;
    const d = document.createElement('div');
    d.className = `cell ${p.side}`;
    d.id = `cell-${i}`;
    d.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
    let html = '';
    if(cell.color && COLOR_MAP[cell.color])
      html += `<div class="color-stripe" style="background:${COLOR_MAP[cell.color]}"></div>`;
    const icon = CELL_ICONS[cell.type]||'';
    html += `<div class="cell-name">${icon} ${cell.name}</div>`;
    if(cell.price) html += `<div class="cell-price">$${cell.price}</div>`;
    if(cell.amount) html += `<div class="cell-price">$${cell.amount}</div>`;
    d.innerHTML = html;
    el.appendChild(d);
  });

  const center = document.createElement('div');
  center.className = 'board-center';
  center.innerHTML = '<h1>МОНОПОЛИЯ</h1><p>Онлайн</p>';
  el.appendChild(center);

  return positions;
}

function getCellCenter(positions, idx){
  const p = positions[idx];
  return p ? {x:p.x+p.w/2, y:p.y+p.h/2} : {x:0,y:0};
}

function getTokenOffset(playerIndex, total){
  if(total<=1) return {x:0,y:0};
  if(total===2) return [{x:-10,y:-10},{x:10,y:10}][playerIndex];
  return [{x:-14,y:-10},{x:14,y:-10},{x:0,y:14}][playerIndex];
}
