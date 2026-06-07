# DialogHost

Source: `src/Renderer/Component/Dialog.tsx`
Story: `src/Renderer/Stories/Component/Dialog.stories.tsx`

역할:

- 특정 화면 children 위에 Dialog를 조건부로 올리는 wrapper.
- Dialog 자체 요구사항은 `Dialog.md`를 우선 수정한다.

현재 UI:

- children을 그대로 렌더링한다.
- `dialog` prop이 있으면 Dialog를 추가로 렌더링한다.

주요 props:

- `children`
- `dialog`

UI 변경 지시 포인트:

- 화면 위 dialog stack 처리.
- 여러 dialog를 지원할지.
- host 단위 backdrop 정책.

유지할 계약:

- host는 layout wrapper 역할만 한다.
