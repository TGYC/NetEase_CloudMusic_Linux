'use strict';

const api = window.mini;

const els = {
  card: document.querySelector('.card'),
  coverImg: document.getElementById('coverImg'),
  coverFallback: document.getElementById('coverFallback'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  btnPrev: document.getElementById('btnPrev'),
  btnPlay: document.getElementById('btnPlay'),
  btnNext: document.getElementById('btnNext'),
  btnPin: document.getElementById('btnPin'),
  btnClose: document.getElementById('btnClose'),
};

function render(state) {
  const s = state || {};
  els.card.classList.toggle('playing', !!s.playing);

  if (s.cover) {
    els.coverImg.src = s.cover;
    els.coverImg.style.display = 'block';
    els.coverFallback.style.display = 'none';
  } else {
    els.coverImg.removeAttribute('src');
    els.coverImg.style.display = 'none';
    els.coverFallback.style.display = 'flex';
  }

  if (s.title) {
    els.title.textContent = s.title;
    els.title.title = s.title;
  } else {
    els.title.textContent = '未播放';
  }
  if (s.artist) {
    els.artist.textContent = s.artist;
    els.artist.title = s.artist;
  } else {
    els.artist.textContent = '打开主窗口选择歌曲';
  }
}

// 事件
els.btnPrev.addEventListener('click', () => api.command('prev'));
els.btnPlay.addEventListener('click', () => api.command('playpause'));
els.btnNext.addEventListener('click', () => api.command('next'));
els.btnPin.addEventListener('click', () => api.togglePin());
els.btnClose.addEventListener('click', () => api.close());

// 双击卡片 → 回到主窗口
els.card.addEventListener('dblclick', (e) => {
  if (e.target.closest('button')) return;
  api.restore();
});

// 订阅状态
api.onState(render);
api.onPinState((pinned) => {
  els.btnPin.classList.toggle('pinned', !!pinned);
  els.btnPin.title = pinned ? '取消置顶' : '置顶';
});
render(null);
