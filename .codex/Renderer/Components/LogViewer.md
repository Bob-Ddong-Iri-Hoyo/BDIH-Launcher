[LogViewer]
Renderer Components

[목적]

BDIH-Logger App에 대한 로그와 유저 Bottle들의 로그를 분리해서 기록해 둘 필요가 있음

떄로는 병렬적으로 Bottle들이 실행 될 수 있음.(Hoyogame + Eternal Return)


[구조]

|상단 App/ bottle log 선택창(리스트형식)|
|실제 date 혹은 각 실행 별 log 기록. logfile format {[bottlenames] or [App]}-year-month-date.log |
| 로그뷰 - 실제 로그가 적히는 부분|

[기본 선택사항]






