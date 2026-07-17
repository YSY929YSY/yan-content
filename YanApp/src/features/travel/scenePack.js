// 言 · 通用出行场景库(英语打底)
// 出行场景大同小异,言直接发一份现成的,用户照着说;不用自己从零建。
// 结构:场景族 family → 场景 scene → 若干句 lines(en/zh,可选 when=什么时候用/对方会问)
// ⚠️ 英语句为初稿,均为真实自然表达;正式版可按需再润。zh 是意思不是直译。
export const SCENE_PACK = [
  {
    key: 'flight',
    label: '坐飞机',
    scenes: [
      {
        label: '值机 · 托运',
        look: '看 bag drop、航班号、行李限重(weight limit)。先确认有没有 online check-in。',
        lines: [
          { en: 'Where is the bag drop for this flight?', zh: '这个航班在哪里托运行李?' },
          { en: 'Can I have a window seat, please?', zh: '可以给我一个靠窗的座位吗?' },
          { en: 'Is my bag checked through to Istanbul?', zh: '我的行李直挂到伊斯坦布尔吗?', when: '有转机时一定要问' },
          { en: 'How much is it for one more checked bag?', zh: '多托运一件行李要多少钱?' },
        ],
      },
      {
        label: '安检',
        look: '看 liquids、laptop、belt、coat。听不清就先看前面的人怎么做。',
        lines: [
          { en: 'Do I need to take this out?', zh: '这个需要拿出来吗?' },
          { en: 'Do I take my shoes off?', zh: '鞋要脱吗?' },
          { en: 'Can I keep my phone with me?', zh: '手机可以带在身上吗?' },
        ],
      },
      {
        label: '转机 · 中转',
        look: '到站先找 transfer / connections,别只跟着 exit / baggage 走。看下一段的 gate。',
        lines: [
          { en: 'I have a connecting flight. Where do I go?', zh: '我要转机,该往哪走?', when: '落地先问这句' },
          { en: 'Do I need to collect my bag and check in again?', zh: '我需要取行李再重新托运吗?', when: '不确定是否直挂时' },
          { en: 'My first flight was late. Can I still make this connection?', zh: '我上一班晚点了,还赶得上这班吗?' },
          { en: 'Where is the gate for the flight to Nevsehir?', zh: '去内夫谢希尔的登机口在哪?' },
        ],
      },
      {
        label: '登机口',
        look: '看 gate、boarding time、group。留意 gate changed 和 final call。',
        lines: [
          { en: 'Has the gate changed for this flight?', zh: '这个航班改登机口了吗?' },
          { en: 'Is this the line for boarding?', zh: '这是登机排队的队吗?' },
          { en: 'Is my group boarding now?', zh: '轮到我这组登机了吗?' },
        ],
      },
      {
        label: '过海关 · 入境',
        look: '排 passport control / arrivals。官员会问几个固定问题,提前想好一句话答案。',
        lines: [
          { en: "I'm here for tourism.", zh: '我来旅游。', when: '问 purpose of visit' },
          { en: 'About ten days.', zh: '大概十天。', when: '问 how long are you staying' },
          { en: "I'm staying at a hotel in the old town.", zh: '我住在老城的一家酒店。', when: '问住在哪' },
          { en: 'Nothing to declare.', zh: '没有需要申报的。', when: '过海关绿色通道' },
          { en: 'Here is my return ticket.', zh: '这是我的返程机票。', when: '被要求出示行程' },
        ],
      },
    ],
  },
  {
    key: 'transit',
    label: '公共交通',
    scenes: [
      {
        label: '买票',
        look: '看目的地拼写、单程/往返(single / return)、是否需要 tap 卡。',
        lines: [
          { en: 'One ticket to the city centre, please.', zh: '一张到市中心的票。' },
          { en: 'Do I buy the ticket here or on board?', zh: '票在这里买还是上车买?' },
          { en: 'Can I pay by card?', zh: '可以刷卡吗?' },
        ],
      },
      {
        label: '上对车 · 站台',
        look: '看 platform、方向(终点站名)、departure time。别只看线路号。',
        lines: [
          { en: 'Which platform for the train to Galway?', zh: '去 Galway 的火车在几号站台?' },
          { en: 'Does this bus go to the old town?', zh: '这趟车到老城吗?' },
          { en: 'Is this the right direction for the airport?', zh: '去机场是这个方向吗?' },
        ],
      },
      {
        label: '下车提醒',
        look: '记住目的地站名,或给司机看地图。',
        lines: [
          { en: 'Could you tell me when to get off?', zh: '到站了能提醒我一下吗?' },
          { en: 'How many stops to here?', zh: '到这里还有几站?' },
          { en: 'Does this stop at Alibeyköy?', zh: '这班在 Alibeyköy 停吗?' },
        ],
      },
      {
        label: '打车',
        look: '看上车点、车牌、把目的地地址写好或用地图指。',
        lines: [
          { en: 'Could you take us to this address, please?', zh: '可以送我们到这个地址吗?', when: '把地址给司机看' },
          { en: 'About how much will it cost?', zh: '大概多少钱?', when: '上车前先问价' },
          { en: 'Could you use the meter, please?', zh: '可以打表吗?' },
        ],
      },
    ],
  },
  {
    key: 'hotel',
    label: '入住',
    scenes: [
      {
        label: '入住 check-in',
        look: '看 booking name、check-in time、是否含早餐、房间号、WiFi。',
        lines: [
          { en: 'Hi, we have a reservation under [name].', zh: '你好,我们有预定,名字是…', when: '报预定名字' },
          { en: 'What time is breakfast?', zh: '早餐几点?' },
          { en: 'Could I have the WiFi password?', zh: '可以给我 WiFi 密码吗?' },
          { en: 'Could I have a map of the area?', zh: '可以给我一张周边地图吗?', when: '很多前台有免费地图' },
        ],
      },
      {
        label: '问推荐',
        look: '前台通常最懂本地。可以顺口问吃的、景点、怎么走。',
        lines: [
          { en: 'Any places nearby you would recommend?', zh: '附近有什么你推荐的地方吗?' },
          { en: 'Where do the locals eat around here?', zh: '本地人一般在这附近哪里吃?', when: '想避开游客店' },
          { en: 'Is it safe to walk there at night?', zh: '晚上走去那儿安全吗?' },
        ],
      },
      {
        label: '退房 check-out',
        look: '看退房时间、有没有 minibar 结算。有些酒店会主动问,有些不会,主动开口。',
        lines: [
          { en: 'We are checking out. Could we leave our luggage here until this afternoon?', zh: '我们退房,行李能寄存到下午吗?', when: '几乎每次都用得上' },
          { en: 'Could you call us a taxi to the airport?', zh: '可以帮我们叫一辆去机场的出租车吗?' },
          { en: 'Yes, please. / No, we are fine, thank you.', zh: '好的,麻烦了。/ 不用了,谢谢。', when: '回应前台主动提出的帮忙' },
          { en: 'Could I get a receipt, please?', zh: '可以给我一张收据吗?' },
        ],
      },
    ],
  },
  {
    key: 'dining',
    label: '吃饭',
    scenes: [
      {
        label: '进店 · 点单',
        look: '看是否需要等位、菜单有没有图、招牌菜(house special)。',
        lines: [
          { en: 'A table for two, please.', zh: '两位,谢谢。' },
          { en: "What's the house special?", zh: '你们的招牌菜是什么?' },
          { en: "We'll have a couple of dishes to share.", zh: '我们点几个菜一起分。', when: 'shared plates,大家分着吃' },
          { en: "I'm allergic to nuts. Does this have any?", zh: '我对坚果过敏,这个有吗?', when: '过敏一定要问' },
        ],
      },
      {
        label: '买单 · 分账',
        look: '看是否含服务费(service charge)、要不要给小费。',
        lines: [
          { en: 'Could we have the bill, please?', zh: '可以买单吗?' },
          { en: 'Could we split the bill?', zh: '可以分开付吗?', when: '最省事,通常直接均分' },
          { en: 'Can we split it evenly, please?', zh: '我们平摊就行。', when: '懒得算就这句' },
          { en: 'Is service included?', zh: '含服务费了吗?' },
          { en: 'Could we get this to go?', zh: '这个可以打包吗?' },
        ],
      },
    ],
  },
  {
    key: 'sights',
    label: '逛景点',
    scenes: [
      {
        label: '门票 · 开放',
        look: '看 opening hours、last entry、学生/联票(combo)、是否要预约。',
        lines: [
          { en: 'Two tickets, please.', zh: '两张票,谢谢。' },
          { en: 'What time do you close?', zh: '你们几点关门?' },
          { en: 'Do I need to book in advance?', zh: '需要提前预约吗?' },
          { en: 'Is there a student discount?', zh: '有学生票吗?' },
        ],
      },
      {
        label: '现场 · 求助',
        look: '找 information、洗手间(toilet / restroom)、寄存(cloakroom)。',
        lines: [
          { en: 'Could you take a photo of us?', zh: '可以帮我们拍张照吗?', when: '出镜最常用' },
          { en: 'Where are the toilets?', zh: '洗手间在哪?' },
          { en: 'What time do we need to be back at the meeting point?', zh: '我们几点要回到集合点?', when: '跟团/一日游' },
          { en: 'Is there anywhere to leave our bags?', zh: '有地方可以寄存包吗?' },
        ],
      },
    ],
  },
];
