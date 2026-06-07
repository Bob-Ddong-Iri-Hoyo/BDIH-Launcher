# SelectMenu

Source: `src/Renderer/Component/SelectMenu.tsx`
Story: `src/Renderer/Stories/Component/SelectMenu.stories.tsx`

역할:

- 제한된 옵션 중 하나를 고르는 custom select/dropdown.
- PreferenceView의 locale/accent color 선택에 사용한다.

현재 UI:

- button을 누르면 option list가 열린다.
- selected option label 표시.
- swatchColor가 있으면 색상 swatch 표시.
- outside click과 Escape로 닫는다.

주요 props:

- `value`
- `options`
- `onChange`
- `label`
- `className`

UI 변경 지시 포인트:

- option row 높이.
- swatch 형태.
- dropdown 위치와 shadow.
- keyboard interaction.

유지할 계약:

- 단일 선택 UI다.
- 선택 후 menu는 닫힌다.
