(() => {
  const LEVELS = [
    {
      id: 'training_run',
      name: 'Training Run',
      width: 1400,
      height: 900,
      start: { x: 110, y: 110 },
      goal: { x: 1250, y: 760, radius: 42 },
      reward: {
        presses: 5000,
        unlocks: ['marble_training_complete'],
        claimKey: 'training_run'
      },
      walls: [
        { x: 0, y: 0, w: 1400, h: 40 },
        { x: 0, y: 860, w: 1400, h: 40 },
        { x: 0, y: 0, w: 40, h: 900 },
        { x: 1360, y: 0, w: 40, h: 900 },

        { x: 220, y: 120, w: 50, h: 480 },
        { x: 400, y: 300, w: 310, h: 50 },
        { x: 720, y: 140, w: 50, h: 380 },
        { x: 900, y: 520, w: 260, h: 50 },
        { x: 540, y: 620, w: 50, h: 180 }
      ],
      failZones: [
        { x: 290, y: 640, w: 220, h: 120 },
        { x: 800, y: 640, w: 260, h: 120 },
        { x: 980, y: 180, w: 180, h: 180 }
      ]
    }
  ];

  function getLevelById(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[0];
  }

  window.MarbleLevels = {
    LEVELS,
    getLevelById
  };
})();