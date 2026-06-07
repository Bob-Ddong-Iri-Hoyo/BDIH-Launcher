# TerminalView App Container

Source: `src/Renderer/View/TerminalView/App.tsx`

역할:

- TerminalView의 React entry container.

현재 책임:

- XTermTerminal을 standalone window에 mount한다.
- 현재는 mock welcome terminal surface만 렌더링한다.

UI 변경 지시 포인트:

- 실제 node-pty/IPC 연결이 들어오면 이 container에서 연결한다.
- terminal layout 자체는 `TerminalView.md` 또는 `Component/Terminal.md`를 수정한다.

유지할 계약:

- terminal text interaction은 유지한다.
