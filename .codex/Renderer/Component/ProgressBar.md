# ProgressBar

Source: `src/Renderer/Component/ProgressBar.tsx`
Story: `src/Renderer/Stories/Component/ProgressBar.stories.tsx`

역할:

- 진행률을 표시하는 공용 progress UI.

현재 UI:

- value를 0-100으로 clamp한다.
- tone별 fill 색상.
- description과 value 표시 옵션.

주요 props:

- `progressValue`
- `descriptionText`
- `showValue`
- `tone`
- `className`

UI 변경 지시 포인트:

- height.
- rounded style.
- label/value 위치.
- animated stripes 여부.

유지할 계약:

- progress value는 0-100 범위로 표시한다.
