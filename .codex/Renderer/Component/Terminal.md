# XTermTerminal

Source: `src/Renderer/Component/Terminal.tsx`
Story: `src/Renderer/Stories/Component/Terminal.stories.tsx`

역할:

- xterm 기반 terminal surface.

현재 UI:

- xterm container를 rounded panel로 감싼다.
- dark terminal theme.
- welcome message와 prompt를 mock으로 출력한다.
- 입력 echo와 Enter/backspace 기본 처리.
- ResizeObserver로 fit 처리.

주요 props:

- `className`
- `height`
- `welcomeMessage`

UI 변경 지시 포인트:

- terminal font, size, line height.
- panel border/background.
- prompt/welcome text.
- 실제 pty 연결 이후 log/terminal 분리.

유지할 계약:

- terminal/log 텍스트는 선택 가능해야 한다.
- fit 실패는 화면을 깨지 않게 처리한다.
