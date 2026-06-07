# Dialog / DialogHost

Source: `src/Renderer/Component/Dialog.tsx`
Story: `src/Renderer/Stories/Component/Dialog.stories.tsx`

역할:

- 앱 전반에서 쓰는 modal/dialog surface.
- `DialogHost`는 특정 화면 위에 Dialog를 올릴 때 사용한다.

현재 UI:

- backdrop blur/dim.
- top 또는 center placement.
- tone별 icon과 border.
- title, description, children, actions 지원.
- Escape와 backdrop click으로 닫기 가능.

주요 props:

- `open`
- `title`
- `description`
- `tone`
- `icon`
- `placement`
- `actions`
- `onClose`

UI 변경 지시 포인트:

- modal 크기, radius, backdrop 강도.
- action button 정렬.
- top/center placement animation.
- icon box 스타일.

유지할 계약:

- 닫기 가능한 dialog는 Escape와 backdrop close를 지원해야 한다.
- destructive action은 danger variant로 구분한다.
