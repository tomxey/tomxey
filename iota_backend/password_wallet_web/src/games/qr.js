// QR rendering for slot invitations.
//
// Generation only: guests scan with their phone's own camera app, which opens
// the URL. That avoids an in-app scanner, a camera permission prompt and a
// decoder library — and it means the host's phone is the only one that needs
// this code at all.
import qrcode from 'qrcode-generator';

const SVG_NS = 'http://www.w3.org/2000/svg';

/// A quiet zone is required by the spec; without it many scanners simply fail.
const MARGIN = 2;

/// Render `text` as an SVG QR into `container`, replacing its contents.
///
/// Built with `createElement` rather than an HTML string, consistent with the
/// rest of the project never using `innerHTML`.
export function renderQr(container, text) {
  // Type 0 picks the smallest version that fits the data; 'M' tolerates about
  // 15% damage, which matters when someone photographs a screen at an angle.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + MARGIN * 2;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  // Without this the renderer antialiases module edges and scanning suffers.
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'invitation QR code');

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#ffffff');
  svg.appendChild(background);

  // One path of disjoint squares rather than thousands of <rect> elements:
  // a 45-module code is 2 025 cells, and the element count shows on a phone.
  const parts = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + MARGIN} ${row + MARGIN}h1v1h-1z`);
    }
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', parts.join(''));
  path.setAttribute('fill', '#000000');
  svg.appendChild(path);

  container.replaceChildren(svg);
}
