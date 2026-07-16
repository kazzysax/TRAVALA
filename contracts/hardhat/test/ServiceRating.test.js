const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { toCityId, toServiceId } = require("../lib/cityId");

const CITY = toCityId("Lisbon", "Portugal");
const SERVICE = toServiceId("miguel-airport-transfer");
const FEE = ethers.parseEther("0.1");
const ZERO = ethers.ZeroHash;
const ZERO_ADDR = ethers.ZeroAddress;

describe("ServiceRating", function () {
  async function deployFixture() {
    const [admin, treasury, relayer, rater, rater2, other] = await ethers.getSigners();
    const Rating = await ethers.getContractFactory("ServiceRating");
    const rating = await Rating.deploy(admin.address, treasury.address);
    await rating.waitForDeployment();

    const RELAYER_ROLE = await rating.RELAYER_ROLE();
    await rating.connect(admin).grantRelayer(relayer.address);

    return { rating, admin, treasury, relayer, rater, rater2, other, RELAYER_ROLE };
  }

  describe("fee handling", function () {
    it("exact fee succeeds and sends no refund", async function () {
      const { rating, rater, treasury } = await loadFixture(deployFixture);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await rating.connect(rater).submitRating(CITY, SERVICE, 5, "great", { value: FEE });

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryAfter - treasuryBefore).to.equal(FEE);
    });

    it("reverts InsufficientFee on underpay with correct values", async function () {
      const { rating, rater } = await loadFixture(deployFixture);
      const underpay = FEE - 1n;
      await expect(rating.connect(rater).submitRating(CITY, SERVICE, 5, "x", { value: underpay }))
        .to.be.revertedWithCustomError(rating, "InsufficientFee")
        .withArgs(FEE, underpay);
    });

    it("refunds exact overpayment to msg.sender on the manual path", async function () {
      const { rating, rater } = await loadFixture(deployFixture);
      const overpay = FEE + ethers.parseEther("0.05");

      const balanceBefore = await ethers.provider.getBalance(rater.address);
      const tx = await rating.connect(rater).submitRating(CITY, SERVICE, 5, "x", { value: overpay });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(rater.address);

      // rater should have net-spent exactly FEE + gas, not the full overpay + gas
      expect(balanceBefore - balanceAfter).to.equal(FEE + gasCost);
      expect(await ethers.provider.getBalance(await rating.getAddress())).to.equal(0n);
    });

    it("reverts TreasuryTransferFailed when the treasury cannot receive ETH", async function () {
      const { rating, admin, rater } = await loadFixture(deployFixture);
      const Rejecting = await ethers.getContractFactory("RejectingCaller");
      const rejecting = await Rejecting.deploy(await rating.getAddress());
      await rejecting.waitForDeployment();

      await rating.connect(admin).setTreasury(await rejecting.getAddress());

      await expect(
        rating.connect(rater).submitRating(CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "TreasuryTransferFailed");
    });

    it("reverts TreasuryTransferFailed when the refund cannot reach the caller", async function () {
      const { rating, treasury } = await loadFixture(deployFixture);
      const Rejecting = await ethers.getContractFactory("RejectingCaller");
      const rejecting = await Rejecting.deploy(await rating.getAddress());
      await rejecting.waitForDeployment();

      await rejecting.fund({ value: ethers.parseEther("1") });

      const overpay = FEE + ethers.parseEther("0.01");
      await expect(
        rejecting.callSubmitRating(CITY, SERVICE, 5, "x", overpay)
      ).to.be.revertedWithCustomError(rating, "TreasuryTransferFailed");
      void treasury;
    });
  });

  describe("daily rate limit", function () {
    it("allows exactly dailyRatingLimit submissions then reverts DailyLimitExceeded", async function () {
      const { rating, admin, rater } = await loadFixture(deployFixture);
      await rating.connect(admin).setDailyRatingLimit(2);

      await rating.connect(rater).submitRating(CITY, SERVICE, 5, "a", { value: FEE });
      await rating.connect(rater).submitRating(CITY, SERVICE, 5, "b", { value: FEE });

      await expect(
        rating.connect(rater).submitRating(CITY, SERVICE, 5, "c", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "DailyLimitExceeded");
    });

    it("resets the limit on the next day boundary", async function () {
      const { rating, admin, rater } = await loadFixture(deployFixture);
      await rating.connect(admin).setDailyRatingLimit(1);

      await rating.connect(rater).submitRating(CITY, SERVICE, 5, "a", { value: FEE });
      await expect(
        rating.connect(rater).submitRating(CITY, SERVICE, 5, "b", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "DailyLimitExceeded");

      const oneDay = 24 * 60 * 60;
      await time.increase(oneDay);

      await expect(rating.connect(rater).submitRating(CITY, SERVICE, 5, "c", { value: FEE })).to.not.be.reverted;
    });

    it("tracks the limit per-rater, independent of the relayer's own address", async function () {
      const { rating, admin, relayer, rater, rater2 } = await loadFixture(deployFixture);
      await rating.connect(admin).setDailyRatingLimit(1);

      await rating.connect(relayer).submitRatingFor(rater.address, CITY, SERVICE, 5, "a", { value: FEE });
      await rating.connect(relayer).submitRatingFor(rater2.address, CITY, SERVICE, 5, "b", { value: FEE });

      await expect(
        rating.connect(relayer).submitRatingFor(rater.address, CITY, SERVICE, 5, "c", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "DailyLimitExceeded");
    });
  });

  describe("admin access control", function () {
    it("setPlatformFee: reverts for non-admin, succeeds + emits for admin", async function () {
      const { rating, admin, other } = await loadFixture(deployFixture);
      await expect(rating.connect(other).setPlatformFee(FEE * 2n)).to.be.revertedWithCustomError(
        rating,
        "AccessControlUnauthorizedAccount"
      );
      await expect(rating.connect(admin).setPlatformFee(FEE * 2n))
        .to.emit(rating, "PlatformFeeUpdated")
        .withArgs(FEE, FEE * 2n);
    });

    it("setTreasury: reverts for non-admin, succeeds + emits for admin, rejects zero address", async function () {
      const { rating, admin, other, treasury } = await loadFixture(deployFixture);
      await expect(rating.connect(other).setTreasury(other.address)).to.be.revertedWithCustomError(
        rating,
        "AccessControlUnauthorizedAccount"
      );
      await expect(rating.connect(admin).setTreasury(other.address))
        .to.emit(rating, "TreasuryUpdated")
        .withArgs(treasury.address, other.address);
      await expect(rating.connect(admin).setTreasury(ZERO_ADDR)).to.be.revertedWithCustomError(rating, "ZeroAddress");
    });

    it("setDailyRatingLimit: reverts for non-admin, succeeds + emits for admin", async function () {
      const { rating, admin, other } = await loadFixture(deployFixture);
      await expect(rating.connect(other).setDailyRatingLimit(5)).to.be.revertedWithCustomError(
        rating,
        "AccessControlUnauthorizedAccount"
      );
      await expect(rating.connect(admin).setDailyRatingLimit(5))
        .to.emit(rating, "DailyLimitUpdated")
        .withArgs(20, 5);
    });

    it("grantRelayer/revokeRelayer: reverts for non-admin, gates submitRatingFor", async function () {
      const { rating, admin, other, rater } = await loadFixture(deployFixture);
      await expect(rating.connect(other).grantRelayer(other.address)).to.be.revertedWithCustomError(
        rating,
        "AccessControlUnauthorizedAccount"
      );
      await expect(rating.connect(other).revokeRelayer(other.address)).to.be.revertedWithCustomError(
        rating,
        "AccessControlUnauthorizedAccount"
      );

      await rating.connect(admin).grantRelayer(other.address);
      await expect(rating.connect(other).submitRatingFor(rater.address, CITY, SERVICE, 5, "x", { value: FEE })).to
        .not.be.reverted;

      await rating.connect(admin).revokeRelayer(other.address);
      await expect(
        rating.connect(other).submitRatingFor(rater.address, CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "AccessControlUnauthorizedAccount");
    });
  });

  describe("submitRatingFor", function () {
    it("reverts for a non-relayer caller", async function () {
      const { rating, other, rater } = await loadFixture(deployFixture);
      await expect(
        rating.connect(other).submitRatingFor(rater.address, CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "AccessControlUnauthorizedAccount");
    });

    it("reverts ZeroAddress when rater is the zero address", async function () {
      const { rating, relayer } = await loadFixture(deployFixture);
      await expect(
        rating.connect(relayer).submitRatingFor(ZERO_ADDR, CITY, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "ZeroAddress");
    });
  });

  describe("input validation (both submit paths)", function () {
    it("reverts EmptyCityOrService when cityId or serviceId is zero", async function () {
      const { rating, rater, relayer } = await loadFixture(deployFixture);
      await expect(
        rating.connect(rater).submitRating(ZERO, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "EmptyCityOrService");
      await expect(
        rating.connect(rater).submitRating(CITY, ZERO, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "EmptyCityOrService");
      await expect(
        rating.connect(relayer).submitRatingFor(rater.address, ZERO, SERVICE, 5, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "EmptyCityOrService");
    });

    it("reverts InvalidRatingValue for value outside 1-5 on both paths", async function () {
      const { rating, rater, relayer } = await loadFixture(deployFixture);
      await expect(
        rating.connect(rater).submitRating(CITY, SERVICE, 0, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "InvalidRatingValue");
      await expect(
        rating.connect(rater).submitRating(CITY, SERVICE, 6, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "InvalidRatingValue");
      await expect(
        rating.connect(relayer).submitRatingFor(rater.address, CITY, SERVICE, 6, "x", { value: FEE })
      ).to.be.revertedWithCustomError(rating, "InvalidRatingValue");
    });
  });

  describe("pagination", function () {
    it("returns empty for offset >= total, truncates when offset+limit > total, and limit=0 returns empty", async function () {
      const { rating, rater } = await loadFixture(deployFixture);
      await rating.connect(rater).submitRating(CITY, SERVICE, 5, "a", { value: FEE });
      await rating.connect(rater).submitRating(CITY, SERVICE, 4, "b", { value: FEE });

      expect((await rating.getCityRatings(CITY, 5, 10)).length).to.equal(0);
      expect((await rating.getCityRatings(CITY, 0, 10)).length).to.equal(2);
      expect((await rating.getCityRatings(CITY, 1, 10)).length).to.equal(1);
      expect((await rating.getCityRatings(CITY, 0, 0)).length).to.equal(0);
    });
  });

  describe("events", function () {
    it("emits RatingSubmitted with correct fields on the manual path", async function () {
      const { rating, rater } = await loadFixture(deployFixture);
      await expect(rating.connect(rater).submitRating(CITY, SERVICE, 5, "great", { value: FEE }))
        .to.emit(rating, "RatingSubmitted")
        .withArgs(rater.address, CITY, SERVICE, 0n, 5, "great", anyValue);
    });

    it("emits RatingSubmitted with correct fields on the relayed path", async function () {
      const { rating, relayer, rater } = await loadFixture(deployFixture);
      await expect(rating.connect(relayer).submitRatingFor(rater.address, CITY, SERVICE, 4, "ok", { value: FEE }))
        .to.emit(rating, "RatingSubmitted")
        .withArgs(rater.address, CITY, SERVICE, 0n, 4, "ok", anyValue);
    });
  });
});
